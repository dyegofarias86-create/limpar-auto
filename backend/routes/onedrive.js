const express = require('express');
const XLSX    = require('xlsx');
const https   = require('https');
const http    = require('http');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const { db }  = require('../db/schema');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const upload = multer({ dest: path.join(__dirname, '../uploads/') });

// 8 representatives — canonical normalized names (no accents)
const TARGET_REPS = [
  { canonical: 'EDNILSON', variants: ['EDNILSON'] },
  { canonical: 'DELIO',    variants: ['DELIO', 'DÉLIO'] },
  { canonical: 'BASE MG',  variants: ['BASE MG', 'BASEMG', 'BASE_MG', 'BASE-MG'] },
  { canonical: 'WALLACE',  variants: ['WALLACE']  },
  { canonical: 'DANIELA',  variants: ['DANIELA', 'DANIELLA'] }, // spreadsheet uses double-L
  { canonical: 'JACKSON',  variants: ['JACKSON']  },
  { canonical: 'OTAVIO',   variants: ['OTAVIO', 'OTÁVIO'] },
  { canonical: 'ARTHUR',   variants: ['ARTHUR']   },
  { canonical: 'DYEGO',    variants: ['DYEGO']    }, // líder também é operador
];

/** Strip accents, uppercase, trim */
function norm(s) {
  return String(s || '').toUpperCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** 
 * Match a RESPONSÁVEL cell value to one of our 7 reps.
 * Uses normalized exact-word matching to avoid false positives.
 */
function matchRep(cellValue) {
  const n = norm(cellValue);
  // Try exact match first
  for (const rep of TARGET_REPS) {
    for (const v of rep.variants) {
      if (n === norm(v)) return rep.canonical;
    }
  }
  // Word boundary match
  const words = n.split(/\s+/);
  for (const rep of TARGET_REPS) {
    for (const v of rep.variants) {
      const nv = norm(v);
      if (words.includes(nv)) return rep.canonical;
    }
  }
  // Substring fallback (only if unambiguous)
  const matches = TARGET_REPS.filter(rep =>
    rep.variants.some(v => n.includes(norm(v)))
  );
  if (matches.length === 1) return matches[0].canonical;
  return null;
}

/** Cache of reps for matching */
let _repCache = null;
function getRepCache() {
  if (!_repCache) {
    _repCache = db.prepare('SELECT r.id, u.name FROM representatives r JOIN users u ON r.user_id = u.id').all()
      .map(r => ({ id: r.id, name: r.name, normalized: norm(r.name) }));
  }
  return _repCache;
}

/** Find DB representative id by canonical name (JS matching, no SQL REPLACE) */
function findRepId(canonical) {
  if (!canonical) return null;
  const nc = norm(canonical);
  const reps = getRepCache();
  // Exact normalized match
  const exact = reps.find(r => r.normalized === nc);
  if (exact) return exact.id;
  // Partial match
  const partial = reps.find(r => r.normalized.includes(nc) || nc.includes(r.normalized));
  return partial?.id || null;
}

/** Normalize column header */
function normalizeHeader(s) {
  return norm(s).replace(/\s+/g, ' ');
}

/**
 * Detect month/year from filename or sheet name.
 * Supports patterns like "JUNHO_2026", "JUL-26", "07/2026", etc.
 */
function detectMonthYear(filename) {
  const MONTH_MAP = {
    JAN:1, FEVE:2, FEV:2, MAR:3, ABR:4, MAI:5, JUN:6,
    JUL:7, AGO:8, SET:9, OUT:10, NOV:11, DEZ:12,
    JANUARY:1, FEBRUARY:2, MARCH:3, APRIL:4, MAY:5, JUNE:6,
    JULY:7, AUGUST:8, SEPTEMBER:9, OCTOBER:10, NOVEMBER:11, DECEMBER:12,
  };
  const upper = norm(filename);
  // Try numeric month/year: 06/2026 or 2026-06
  let m = upper.match(/(\d{1,2})[\/\-_](\d{4})/);
  if (m) return { month: parseInt(m[1]), year: parseInt(m[2]) };
  m = upper.match(/(\d{4})[\/\-_](\d{1,2})/);
  if (m) return { month: parseInt(m[2]), year: parseInt(m[1]) };
  // Try textual month: JUNHO_2026
  for (const [key, val] of Object.entries(MONTH_MAP)) {
    if (upper.includes(key)) {
      const yearMatch = upper.match(/20\d{2}/);
      return { month: val, year: yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear() };
    }
  }
  return null;
}

/**
 * Parse FATURAMENTO_GERAL_CONSOLIDADO_LIMPAR.XLSX
 */
function parseConsolidadoXlsx(filePath, filenameHint = '') {
  const wb = XLSX.readFile(filePath);

  // Initialize billing for all reps
  const billing = {};
  TARGET_REPS.forEach(r => { billing[r.canonical] = { tmo: 0, revenue: 0, rows: 0 }; });

  const clients = [];
  const errors  = [];

  // Try to detect month from filename
  const detectedPeriod = detectMonthYear(filenameHint);

  for (const sheetName of wb.SheetNames) {
    const ws   = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null, header: 1 });
    if (!rows || rows.length < 2) continue;

    // Find header row — supports both:
    // Old format: RESPONSAVEL column (FATURAMENTO_GERAL_CONSOLIDADO)
    // New format: REPRESENTANTE column (Planilha Faturamento Mensal)
    let headerIdx = -1;
    let normalizedHeaders = null;
    let newFormat = false; // true = new monthly planilha format
    for (let i = 0; i < Math.min(15, rows.length); i++) {
      const row = rows[i];
      if (!row) continue;
      const nh = row.map(c => normalizeHeader(c));
      // Old format: has column EXACTLY 'RESPONSAVEL' (not 'RESPONSAVEL FATURAMENTO')
      if (nh.some(c => c === 'RESPONSAVEL')) {
        headerIdx = i;
        normalizedHeaders = nh;
        newFormat = false;
        break;
      }
      // New monthly format: has column EXACTLY 'REPRESENTANTE'
      if (nh.some(c => c === 'REPRESENTANTE')) {
        headerIdx = i;
        normalizedHeaders = nh;
        newFormat = true;
        break;
      }
    }
    if (headerIdx === -1) continue;

    // Column index helper
    const col = (...keywords) => {
      for (const kw of keywords) {
        const idx = normalizedHeaders.findIndex(h => h.includes(kw));
        if (idx >= 0) return idx;
      }
      return -1;
    };
    // Exact match (for columns like 'TMO' that could false-match 'AUTONOMO')
    const colExact = (kw) => normalizedHeaders.findIndex(h => h === kw);

    // Column mappings differ by format
    const respCol = newFormat ? colExact('REPRESENTANTE') : col('RESPONSAVEL');
    const tmoCol  = newFormat ? colExact('TMO')           : col('QTD_TOTAL');   // TMO = total de todos os produtos
    // New format: 'Faturamento (R$)' — match col that has FATURAMENTO and not RESPONSAVEL/FORMA
    const revCol  = newFormat
      ? normalizedHeaders.findIndex(h => h.includes('FATURAMENTO') && !h.includes('RESPONSAVEL') && !h.includes('FORMA'))
      : col('VLR_TOTAL', 'TOTAL', 'FATURAMENTO', 'RECEITA', 'VALOR');
    const groupCol  = col('GRUPO');
    const dealerCol = col('CONCESSIONARIA');
    const storeCol  = col('LOJA');
    const brandCol  = col('MARCA');
    const stateCol  = col('UF');
    const cityCol   = col('MUNICIPIO', 'CIDADE');
    const cnpjCol   = col('CNPJ');
    const emailCol  = col('EMAIL', 'E-MAIL', 'ENVIAR');
    const provCol   = col('PROVIS', 'R$/TMO', 'PROVISAO');

    if (respCol === -1) continue;

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[respCol]) continue;

      const canonical = matchRep(row[respCol]);
      if (!canonical) continue;

      const tmo = tmoCol >= 0 ? (parseFloat(row[tmoCol]) || 0) : 0;
      const rev = revCol  >= 0 ? (parseFloat(row[revCol])  || 0) : 0;


      billing[canonical].tmo     += tmo;
      billing[canonical].revenue += rev;
      billing[canonical].rows++;

      // Extract client
      const cnpj     = cnpjCol  >= 0 ? String(row[cnpjCol]  || '').trim() : '';
      const storeName = storeCol >= 0 ? String(row[storeCol] || '').trim() : '';

      if (cnpj || storeName) {
        const repId = findRepId(canonical);
        clients.push({
          group_name:        groupCol  >= 0 ? String(row[groupCol]  || '').trim() : '',
          dealer_name:       dealerCol >= 0 ? String(row[dealerCol] || '').trim() : storeName,
          store_name:        storeName,
          brand:             brandCol  >= 0 ? String(row[brandCol]  || '').trim() : '',
          state:             stateCol  >= 0 ? String(row[stateCol]  || '').trim() : '',
          city:              cityCol   >= 0 ? String(row[cityCol]   || '').trim() : '',
          cnpj:              cnpj,
          email:             emailCol  >= 0 ? String(row[emailCol]  || '').trim() : '',
          representative_id: repId,
          provision_per_tmo: provCol   >= 0 ? (parseFloat(row[provCol]) || 0) : 0,
          _repName: canonical,
        });
      }
    }
  }

  return {
    billing,
    clients:        deduplicateClients(clients),
    errors,
    detectedPeriod,
  };
}

function deduplicateClients(clients) {
  const seen = new Set();
  return clients.filter(c => {
    const key = c.cnpj || c.store_name;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Save billing + clients — ADDITIVE (doesn't clear existing months)
 */
function saveToDb(parsed, month, year, userId, filename) {
  _repCache = null; // reset cache to get fresh data

  const { billing, clients, errors } = parsed;
  const saved        = [];
  const savedClients = { created: 0, updated: 0, errors: 0 };

  // ── Billing ──────────────────────────────────────────────────
  for (const [canonical, vals] of Object.entries(billing)) {
    if (vals.rows === 0) continue;
    try {
      const rep = getRepCache().find(r => r.normalized === norm(canonical) || r.normalized.includes(norm(canonical)));
      if (!rep) { errors.push(`Rep não encontrado: ${canonical}`); continue; }
      const repId = rep.id;

      const seller = db.prepare('SELECT id FROM sellers WHERE representative_id = ?').get(repId);
      const client = db.prepare('SELECT id FROM clients WHERE representative_id = ? LIMIT 1').get(repId);
      const clientId = client?.id || 1;

      const existing = db.prepare(`SELECT id FROM billing WHERE representative_id = ? AND month = ? AND year = ? AND product = 'CONSOLIDADO_ONEDRIVE'`).get(repId, month, year);
      if (existing) {
        db.prepare(`UPDATE billing SET qty = ?, total = ? WHERE id = ?`).run(vals.tmo, vals.revenue, existing.id);
      } else {
        db.prepare(`INSERT INTO billing (representative_id, seller_id, client_id, product, unit_price, qty, total, month, year) VALUES (?,?,?,'CONSOLIDADO_ONEDRIVE',0,?,?,?,?)`).run(repId, seller?.id || null, clientId, vals.tmo, vals.revenue, month, year);
      }

      const newBudget = vals.tmo * 0.25;
      const mkt = db.prepare('SELECT id, used_budget FROM marketing_budget WHERE representative_id = ? AND month = ? AND year = ?').get(repId, month, year);
      if (mkt) {
        db.prepare('UPDATE marketing_budget SET tmo_qty=?, total_budget=?, available_budget=? WHERE id=?').run(vals.tmo, newBudget, Math.max(0, newBudget - (mkt.used_budget || 0)), mkt.id);
      } else {
        db.prepare('INSERT OR IGNORE INTO marketing_budget (representative_id, month, year, tmo_qty, rate, total_budget, used_budget, available_budget) VALUES (?,?,?,?,0.25,?,0,?)').run(repId, month, year, vals.tmo, newBudget, newBudget);
      }

      saved.push({ rep: canonical, tmo: vals.tmo, revenue: vals.revenue });
    } catch (e) {
      errors.push(`Billing ${canonical}: ${e.message}`);
    }
  }

  // ── Clients (UPSERT) ─────────────────────────────────────────
  for (const c of clients) {
    try {
      if (!c.store_name && !c.cnpj) continue;
      const existing = c.cnpj
        ? db.prepare('SELECT id, representative_id FROM clients WHERE cnpj = ?').get(c.cnpj)
        : db.prepare('SELECT id, representative_id FROM clients WHERE UPPER(store_name) = ?').get((c.store_name || '').toUpperCase());

      if (existing) {
        // Always update representative_id — the sync is the source of truth
        db.prepare(`UPDATE clients SET 
          group_name = CASE WHEN ? != '' THEN ? ELSE group_name END,
          dealer_name = CASE WHEN ? != '' THEN ? ELSE dealer_name END,
          brand = CASE WHEN ? != '' THEN ? ELSE brand END,
          state = CASE WHEN ? != '' THEN ? ELSE state END,
          city  = CASE WHEN ? != '' THEN ? ELSE city END,
          representative_id = ?
          WHERE id = ?`).run(
          c.group_name, c.group_name,
          c.dealer_name, c.dealer_name,
          c.brand, c.brand,
          c.state, c.state,
          c.city, c.city,
          c.representative_id,
          existing.id
        );
        savedClients.updated++;
      } else {
        db.prepare(`INSERT OR IGNORE INTO clients 
          (group_name, dealer_name, store_name, brand, state, city, cnpj, email, representative_id, provision_per_tmo)
          VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
          c.group_name || c.store_name, c.dealer_name || c.store_name,
          c.store_name, c.brand, c.state, c.city,
          c.cnpj || null, c.email || null,
          c.representative_id, c.provision_per_tmo || 0
        );
        savedClients.created++;
      }
    } catch (e) {
      savedClients.errors++;
      errors.push(`Cliente ${c.store_name}: ${e.message}`);
    }
  }

  db.prepare('INSERT INTO upload_history (filename, user_id, status, records_success, records_error) VALUES (?,?,?,?,?)').run(
    filename || 'OneDrive Sync', userId, 'completed', saved.length, errors.length
  );

  return { saved, savedClients, errors };
}

// ── POST /api/onedrive/sync-upload ────────────────────────────────
router.post('/sync-upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });

  const parsed = parseConsolidadoXlsx(req.file.path, req.file.originalname);

  // Determine month/year: from body > detected from filename > current month
  let month = parseInt(req.body.month);
  let year  = parseInt(req.body.year);
  if (!month || !year) {
    if (parsed.detectedPeriod) {
      month = parsed.detectedPeriod.month;
      year  = parsed.detectedPeriod.year;
    } else {
      month = new Date().getMonth() + 1;
      year  = new Date().getFullYear();
    }
  }

  try {
    const result = saveToDb(parsed, month, year, req.user.id, req.file.originalname);
    res.json({
      success: true,
      period: { month, year },
      billing:       parsed.billing,
      clientsFound:  parsed.clients.length,
      clientsSaved:  result.savedClients,
      result,
    });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao processar: ' + e.message });
  }
});

// ── POST /api/onedrive/sync-url ───────────────────────────────────
router.post('/sync-url', async (req, res) => {
  const { url, month: reqMonth, year: reqYear } = req.body;
  if (!url) return res.status(400).json({ error: 'URL não informada' });

  const tmpPath = path.join(__dirname, '../uploads/', `od_${Date.now()}.xlsx`);
  try {
    await new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      const file = fs.createWriteStream(tmpPath);
      protocol.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, response => {
        if (response.statusCode >= 400) return reject(new Error(`HTTP ${response.statusCode}`));
        response.pipe(file);
        file.on('finish', () => { file.close(resolve); });
      }).on('error', reject);
    });

    const parsed = parseConsolidadoXlsx(tmpPath, url);
    let month = parseInt(reqMonth);
    let year  = parseInt(reqYear);
    if (!month || !year) {
      if (parsed.detectedPeriod) { month = parsed.detectedPeriod.month; year = parsed.detectedPeriod.year; }
      else { month = new Date().getMonth() + 1; year = new Date().getFullYear(); }
    }

    const result = saveToDb(parsed, month, year, req.user.id, 'OneDrive URL');
    fs.unlink(tmpPath, () => {});
    res.json({ success: true, period: { month, year }, billing: parsed.billing, clientsFound: parsed.clients.length, clientsSaved: result.savedClients, result });
  } catch (e) {
    fs.unlink(tmpPath, () => {});
    res.status(500).json({ error: 'Erro: ' + e.message });
  }
});

// ── GET /api/onedrive/status ──────────────────────────────────────
router.get('/status', (req, res) => {
  const history = db.prepare(`SELECT uh.*, u.name as uploader FROM upload_history uh JOIN users u ON uh.user_id = u.id ORDER BY uh.created_at DESC LIMIT 15`).all();
  res.json(history);
});

// ── GET /api/onedrive/preview ─────────────────────────────────────
router.get('/preview', (req, res) => {
  const { month, year } = req.query;
  const m = parseInt(month) || new Date().getMonth() + 1;
  const y = parseInt(year)  || new Date().getFullYear();
  const data = db.prepare(`SELECT u.name as rep_name, b.qty as tmo, b.total as revenue FROM billing b JOIN representatives r ON b.representative_id = r.id JOIN users u ON r.user_id = u.id WHERE b.product = 'CONSOLIDADO_ONEDRIVE' AND b.month = ? AND b.year = ? ORDER BY b.total DESC`).all(m, y);
  res.json(data);
});

module.exports = router;
