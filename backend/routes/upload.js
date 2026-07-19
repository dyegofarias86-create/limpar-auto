const express = require('express');
const multer  = require('multer');
const XLSX    = require('xlsx');
const path    = require('path');
const fs      = require('fs');
const { db }  = require('../db/schema');
const { authMiddleware } = require('../middleware/auth');
const { createNotification } = require('./notifications');

const router = express.Router();
router.use(authMiddleware);

const upload = multer({ dest: path.join(__dirname, '../uploads/') });

const MONTHS_MAP = {
  'JAN': 1, 'FEV': 2, 'MAR': 3, 'ABR': 4, 'MAI': 5, 'JUN': 6,
  'JUL': 7, 'AGO': 8, 'SET': 9, 'OUT': 10, 'NOV': 11, 'DEZ': 12,
  'JANEIRO': 1, 'FEVEREIRO': 2, 'MARÇO': 3, 'ABRIL': 4, 'MAIO': 5, 'JUNHO': 6,
  'JULHO': 7, 'AGOSTO': 8, 'SETEMBRO': 9, 'OUTUBRO': 10, 'NOVEMBRO': 11, 'DEZEMBRO': 12,
};

function norm(s) {
  if (!s) return '';
  return String(s).trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function findRepByName(name) {
  if (!name) return null;
  const n = norm(name);
  const reps = db.prepare('SELECT r.id, u.name, u.email FROM representatives r JOIN users u ON r.user_id = u.id').all();
  return reps.find(r => {
    const rn = norm(r.name);
    return rn === n || rn.includes(n) || n.includes(rn.split(' ')[0]);
  }) || null;
}

function monthFromString(str) {
  if (!str) return null;
  const s = norm(str).replace(/\s/g, '');
  return MONTHS_MAP[s] || null;
}

/** Process GASTOS REP sheet */
function processGastosRep(ws, repId, month, year, actorId, actorName) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const results = { saved: 0, errors: [] };

  // Find GASTOS MENSAIS section
  let totalRow = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const first = norm(String(r[0] || ''));
    if (first === 'TOTAL PREVISTO') {
      const total = parseFloat(r[1]) || 0;
      if (total > 0) {
        totalRow = { total, row: i };
      }
      break;
    }
  }

  // Parse individual expense categories
  const categories = {
    'REFEICAO': 0, 'HOTEL': 0, 'COMBUSTIVEL': 0, 'ALUGUEL': 0, 'OUTROS': 0
  };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    const label = norm(String(r[0]));
    const val = parseFloat(r[1]) || 0;

    if (label.includes('REFEICAO') || label.includes('REFEIÇÃO')) categories['REFEICAO'] = val;
    else if (label.includes('HOTEL')) categories['HOTEL'] = val;
    else if (label.includes('COMBUSTIVEL') || label.includes('COMBUSTÍVEL')) categories['COMBUSTIVEL'] = val;
    else if (label.includes('ALUGUEL')) categories['ALUGUEL'] = val;
    else if (label === 'OUTROS') categories['OUTROS'] = val;
  }

  // Also pick up items in OUTROS section
  let othersTotal = 0;
  let inOthers = false;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const first = norm(String(r[0] || ''));
    if (first === 'OUTROS' && !inOthers) { inOthers = true; continue; }
    if (inOthers && r[3] && !isNaN(parseFloat(r[3]))) {
      othersTotal += parseFloat(r[3]) || 0;
    }
    if (inOthers && first.includes('PREENCHER')) break;
  }
  if (othersTotal > 0) categories['OUTROS'] = othersTotal;

  // Save each category as an expense
  const expenseTypes = [
    { key: 'REFEICAO',    category: 'Refeição', type: 'VIAGEM' },
    { key: 'HOTEL',       category: 'Hotel', type: 'VIAGEM' },
    { key: 'COMBUSTIVEL', category: 'Combustível', type: 'VIAGEM' },
    { key: 'ALUGUEL',     category: 'Aluguel Veículo', type: 'FIXO' },
    { key: 'OUTROS',      category: 'Outros', type: 'VIAGEM' },
  ];

  for (const et of expenseTypes) {
    const amount = categories[et.key];
    if (amount <= 0) continue;
    try {
      // Check if already exists
      const exists = db.prepare(
        'SELECT id FROM expenses WHERE representative_id=? AND month=? AND year=? AND category=?'
      ).get(repId, month, year);
      if (exists) {
        db.prepare('UPDATE expenses SET amount=? WHERE id=?').run(amount, exists.id);
      } else {
        db.prepare(
          'INSERT INTO expenses (type,category,description,amount,month,year,representative_id) VALUES (?,?,?,?,?,?,?)'
        ).run(et.type, et.category, `${et.category} - planejamento`, amount, month, year, repId);
      }
      results.saved++;
    } catch (e) {
      results.errors.push(`Gasto ${et.category}: ${e.message}`);
    }
  }

  return results;
}

/** Process VB MKT sheet */
function processVbMkt(ws, repId, year, actorId) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const results = { saved: 0, errors: [] };

  let inData = false;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const first = norm(String(r[0] || ''));
    
    // Find header row with MES, TMO, R$
    if (first === 'MES') { inData = true; continue; }
    if (!inData) continue;
    if (first === 'TOTAL' || first === 'RESUMO') { inData = false; continue; }

    const monthNum = monthFromString(r[0]);
    if (!monthNum) continue;
    const tmo = parseFloat(r[1]) || 0;
    const budget = parseFloat(r[2]) || 0;
    if (tmo <= 0 && budget <= 0) continue;

    try {
      const rate = tmo > 0 ? budget / tmo : 0.25;
      const exists = db.prepare(
        'SELECT id FROM marketing_budget WHERE representative_id=? AND month=? AND year=?'
      ).get(repId, monthNum, year);
      
      if (exists) {
        db.prepare('UPDATE marketing_budget SET tmo_qty=?,rate=?,total_budget=?,available_budget=? WHERE id=?')
          .run(tmo, rate, budget, budget, exists.id);
      } else {
        db.prepare(
          'INSERT OR IGNORE INTO marketing_budget (representative_id,month,year,tmo_qty,rate,total_budget,used_budget,available_budget) VALUES (?,?,?,?,?,?,0,?)'
        ).run(repId, monthNum, year, tmo, rate, budget, budget);
      }
      results.saved++;
    } catch (e) {
      results.errors.push(`MKT mês ${monthNum}: ${e.message}`);
    }
  }
  return results;
}

/** Process PROVISÃO sheet - update provision_per_tmo for clients */
function processProv(ws, repId, month, year) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const results = { saved: 0, errors: [], skipped: 0, notFound: [] };

  // Find header row (has CNPJ column)
  let headerIdx = -1;
  let cnpjIdx = -1, provIdx = -1, provMesIdx = -1, qtyIdx = -1, totalIdx = -1, saldoAntIdx = -1;

  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const r = rows[i];
    if (!r) continue;
    const normRow = r.map(c => norm(String(c || '')));
    if (normRow.includes('CNPJ')) {
      headerIdx = i;
      cnpjIdx      = normRow.indexOf('CNPJ');
      qtyIdx       = normRow.indexOf('QTD');
      totalIdx     = normRow.indexOf('TOTAL');
      // Find PROVIS. column (provision rate R$/TMO)
      provIdx      = normRow.findIndex(h => h.startsWith('PROVIS') && !h.includes('MES') && !h.includes('MÊS') && !h.includes('ANT') && !h.includes('TOT') && !h.includes('SAL'));
      // Find PROVIS. MÊS
      provMesIdx   = normRow.findIndex(h => h.includes('PROVIS') && (h.includes('MES') || h.includes('MÊS')));
      // SALDO ANTERIOR
      saldoAntIdx  = normRow.findIndex(h => h.includes('SALDO') && h.includes('ANTERIOR'));
      break;
    }
  }

  if (headerIdx === -1 || cnpjIdx === -1) {
    results.errors.push('Cabeçalho CNPJ não encontrado na aba PROVISÃO');
    return results;
  }

  const CNPJ_RE = /\d{2}[\.\-]?\d{3}[\.\-]?\d{3}[\/\-]?\d{4}[\-]?\d{2}/;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[cnpjIdx]) continue;
    
    const cnpjRaw = String(row[cnpjIdx] || '').trim();
    if (!CNPJ_RE.test(cnpjRaw)) continue;

    const provRate  = provIdx    >= 0 ? (parseFloat(row[provIdx])    || 0) : 0;
    const provMes   = provMesIdx >= 0 ? (parseFloat(row[provMesIdx]) || 0) : 0;
    const qty       = qtyIdx     >= 0 ? (parseFloat(row[qtyIdx])     || 0) : 0;
    const total     = totalIdx   >= 0 ? (parseFloat(row[totalIdx])   || 0) : 0;
    const saldoAnt  = saldoAntIdx >= 0 ? (parseFloat(row[saldoAntIdx]) || 0) : 0;

    try {
      const client = db.prepare('SELECT id, representative_id FROM clients WHERE cnpj = ?').get(cnpjRaw);
      if (!client) {
        results.notFound.push(cnpjRaw);
        results.skipped++;
        continue;
      }

      // Update provision_per_tmo on client if provRate > 0
      if (provRate > 0) {
        db.prepare('UPDATE clients SET provision_per_tmo=? WHERE id=?').run(provRate, client.id);
      }

      // Create/update provision record if there's provision data
      if (provMes > 0 || qty > 0) {
        const existing = db.prepare(
          'SELECT id, withdrawn, current_balance FROM provisions WHERE client_id=? AND month=? AND year=?'
        ).get(client.id, month, year);

        if (existing) {
          const newBalance = provMes + saldoAnt - (existing.withdrawn || 0);
          db.prepare('UPDATE provisions SET tmo_qty=?,revenue=?,provision_amount=?,current_balance=? WHERE id=?')
            .run(qty, total, provMes, Math.max(0, newBalance), existing.id);
        } else {
          db.prepare(
            'INSERT INTO provisions (representative_id,client_id,month,year,tmo_qty,revenue,provision_amount,previous_balance,withdrawn,current_balance) VALUES (?,?,?,?,?,?,?,?,0,?)'
          ).run(client.representative_id || repId, client.id, month, year, qty, total, provMes, saldoAnt, provMes + saldoAnt);
        }
        results.saved++;
      }
    } catch (e) {
      results.errors.push(`CNPJ ${cnpjRaw}: ${e.message}`);
    }
  }
  return results;
}

/** POST /api/upload - Planilha Geral Operador */
router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });

  const histId = db.prepare('INSERT INTO upload_history (filename, user_id, status) VALUES (?,?,?)')
    .run(req.file.originalname, req.user.id, 'processing').lastInsertRowid;

  try {
    const wb = XLSX.readFile(req.file.path);
    const result = { success: 0, errors: [], sheets: [], details: {} };
    const currentYear = new Date().getFullYear();

    // Detect rep and month from any sheet header
    let repId = null, repName = null, uploadMonth = null, uploadYear = currentYear;

    // Try to find rep from GASTOS REP or PROVISÃO sheet headers
    for (const sheetName of ['GASTOS REP', 'PROVISÃO', 'GASTOS VEND']) {
      if (!wb.SheetNames.includes(sheetName)) continue;
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      for (let i = 0; i < Math.min(5, rows.length); i++) {
        const r = rows[i];
        if (!r) continue;
        const label = norm(String(r[0] || ''));
        if (label.includes('REPRESENTANTE') && r[1]) {
          const found = findRepByName(String(r[1]));
          if (found) { repId = found.id; repName = found.name; }
        }
        if ((label.includes('MES') || label.includes('MÊS')) && r[1]) {
          const m = monthFromString(String(r[1]));
          if (m) uploadMonth = m;
        }
      }
      if (repId && uploadMonth) break;
    }

    // Fallback: use logged-in user's rep
    if (!repId && req.user.rep_id) {
      repId = req.user.rep_id;
      const u = db.prepare('SELECT name FROM users WHERE id=?').get(req.user.id);
      repName = u?.name || req.user.email;
    }

    // Fallback month: current month
    if (!uploadMonth) uploadMonth = new Date().getMonth() + 1;

    if (!repId) {
      return res.status(400).json({ error: 'Representante não identificado na planilha. Verifique o campo REPRESENTANTE.' });
    }

    // Process GASTOS REP
    if (wb.SheetNames.includes('GASTOS REP')) {
      const r = processGastosRep(wb.Sheets['GASTOS REP'], repId, uploadMonth, uploadYear, req.user.id, repName);
      result.sheets.push('GASTOS REP');
      result.success += r.saved;
      result.errors.push(...r.errors);
      result.details.gastosRep = r;
    }

    // Process VB MKT
    if (wb.SheetNames.includes('VB MKT')) {
      const r = processVbMkt(wb.Sheets['VB MKT'], repId, uploadYear, req.user.id);
      result.sheets.push('VB MKT');
      result.success += r.saved;
      result.errors.push(...r.errors);
      result.details.vbMkt = r;
    }

    // Process PROVISÃO
    if (wb.SheetNames.includes('PROVISÃO')) {
      const r = processProv(wb.Sheets['PROVISÃO'], repId, uploadMonth, uploadYear);
      result.sheets.push('PROVISÃO');
      result.success += r.saved;
      result.errors.push(...r.errors);
      result.details.provisao = r;
    }

    // Notify
    try {
      createNotification(db, {
        type: 'upload',
        title: `📋 Planilha Operador importada`,
        body: `${req.user.name || req.user.email} importou planilha de ${repName} — ${result.success} registros salvos`,
        source: 'upload', actor_id: req.user.id, actor_name: req.user.name || req.user.email,
      });
    } catch(e) {}

    // Cleanup
    try { fs.unlinkSync(req.file.path); } catch(e) {}

    db.prepare('UPDATE upload_history SET status=?,records_success=?,records_error=?,error_log=? WHERE id=?')
      .run('completed', result.success, result.errors.length, JSON.stringify(result.errors.slice(0, 10)), histId);

    res.json({
      success: true,
      repName, repId, month: uploadMonth, year: uploadYear,
      result,
    });

  } catch (err) {
    try { fs.unlinkSync(req.file.path); } catch(e) {}
    db.prepare('UPDATE upload_history SET status=?,error_log=? WHERE id=?').run('failed', err.message, histId);
    res.status(500).json({ error: 'Erro ao processar arquivo: ' + err.message });
  }
});

router.get('/history', (req, res) => {
  const history = db.prepare('SELECT uh.*, u.name as uploader FROM upload_history uh JOIN users u ON uh.user_id = u.id ORDER BY uh.created_at DESC LIMIT 20').all();
  res.json(history);
});

module.exports = router;
