/**
 * Upload da Planilha de Faturamento Mensal
 * Formato: Grupo | Concessionária | Loja | UF | Município | CNPJ | Representante | ... | TMO | Faturamento (R$)
 */
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

// Map rep names from spreadsheet → DB rep IDs
function buildRepMap() {
  const reps = db.prepare(`
    SELECT r.id, u.name, u.email FROM representatives r JOIN users u ON r.user_id = u.id
  `).all();

  const map = {};
  reps.forEach(r => {
    const key = normalize(r.name);
    map[key] = r.id;

    // DYEGO: stored as "Dyego (Líder)" but appears as "Dyego" in spreadsheet
    if (key.includes('dyego') || (r.email && r.email.includes('lider@limpar'))) {
      map['dyego'] = r.id;
      map['dyego b'] = r.id;
    }
    // DANIELA / DANIELLA
    if (key.includes('daniel')) {
      map['daniela'] = r.id;
      map['daniella'] = r.id;
    }
    // DÉLIO / DELIO
    if (key.includes('delio')) {
      map['delio'] = r.id;
    }
    // OTÁVIO / OTAVIO
    if (key.includes('otavio')) {
      map['otavio'] = r.id;
    }
  });
  return map;
}

function normalize(str) {
  if (!str) return '';
  return str.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Ensure client exists by CNPJ, create if needed
function upsertClient(row, repId) {
  const cnpj = String(row['CNPJ'] || '').trim();
  if (!cnpj) return null;

  let client = db.prepare('SELECT id FROM clients WHERE cnpj = ?').get(cnpj);
  if (!client) {
    const res = db.prepare(`
      INSERT INTO clients (group_name, dealer_name, store_name, brand, state, city, cnpj, representative_id, active)
      VALUES (?,?,?,?,?,?,?,?,1)
    `).run(
      row['Grupo'] || '',
      row['Concessionária'] || '',
      row['Loja'] || '',
      '',
      row['UF'] || '',
      row['Município'] || '',
      cnpj,
      repId
    );
    return res.lastInsertRowid;
  }
  // Update rep assignment if empty
  if (repId) {
    db.prepare('UPDATE clients SET representative_id=? WHERE id=? AND (representative_id IS NULL OR representative_id=0)')
      .run(repId, client.id);
  }
  return client.id;
}

// POST /api/faturamento-upload
router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });

  const { month, year } = req.body;
  const m = parseInt(month);
  const y = parseInt(year);

  if (!m || !y || m < 1 || m > 12 || y < 2020) {
    return res.status(400).json({ error: 'Mês e ano inválidos. Informe month (1-12) e year (ex: 2026).' });
  }

  try {
    const wb = XLSX.readFile(req.file.path);
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

    const repMap = buildRepMap();
    const MONTHS = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    let saved = 0, skipped = 0, errors = [];

    // Delete ALL billing for this month/year (SERVICOS + CONSOLIDADO_ONEDRIVE + outros) para evitar duplicatas
    const deleted = db.prepare('DELETE FROM billing WHERE month=? AND year=?').run(m, y).changes;
    console.log(`Billing deletado antes do re-import: ${deleted} registros para ${m}/${y}`);

    const stmtBilling = db.prepare(`
      INSERT INTO billing (representative_id, client_id, product, unit_price, qty, total, month, year)
      VALUES (?, ?, 'SERVICOS', 0, ?, ?, ?, ?)
    `);

    for (const row of rows) {
      const repName = String(row['Representante'] || '').trim();
      const repKey  = normalize(repName);
      const repId   = repMap[repKey];

      // Skip reps not in our system
      if (!repId) {
        skipped++;
        continue;
      }

      const tmo   = parseFloat(row['TMO'] || row['Tmo'] || 0) || 0;
      const valor = parseFloat(String(row['Faturamento (R$)'] || row['Faturamento'] || 0).replace(',', '.')) || 0;

      // Skip rows with no billing (pendentes)
      if (tmo === 0 && valor === 0) {
        skipped++;
        continue;
      }

      try {
        const clientId = upsertClient(row, repId);
        stmtBilling.run(repId, clientId, tmo, valor, m, y);
        saved++;
      } catch (e) {
        errors.push(`Linha ${repName}/${row['Loja']}: ${e.message}`);
      }
    }

    // Notify
    try {
      createNotification(db, {
        type: 'upload',
        title: `📊 Faturamento ${MONTHS[m]}/${y} importado`,
        body: `${saved} registros importados (${skipped} ignorados) para ${MONTHS[m]}/${y}`,
        source: 'faturamento',
        actor_id: req.user.id,
        actor_name: req.user.name || req.user.email,
      });
    } catch(e) {}

    // Cleanup temp file
    try { fs.unlinkSync(req.file.path); } catch(e) {}

    res.json({
      success: true,
      month: m, year: y,
      savedRecords: saved,
      skippedRecords: skipped,
      deletedPrevious: deleted,
      errors: errors.slice(0, 20),
    });

  } catch (err) {
    try { fs.unlinkSync(req.file.path); } catch(e) {}
    res.status(500).json({ error: 'Erro ao processar arquivo: ' + err.message });
  }
});

module.exports = router;
