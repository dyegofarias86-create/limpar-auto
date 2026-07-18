const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const { db } = require('../db/schema');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

const upload = multer({ dest: path.join(__dirname, '../uploads/') });

router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });

  const histId = db.prepare('INSERT INTO upload_history (filename, user_id, status) VALUES (?,?,?)').run(req.file.originalname, req.user.id, 'processing').lastInsertRowid;

  try {
    const wb = XLSX.readFile(req.file.path);
    const result = { success: 0, errors: [], sheets: [] };

    // Process PROVISÃO sheet
    if (wb.SheetNames.includes('PROVISÃO')) {
      const ws = wb.Sheets['PROVISÃO'];
      const data = XLSX.utils.sheet_to_json(ws, { defval: null });
      result.sheets.push('PROVISÃO');
      // Basic parse - detect data rows by CNPJ pattern
      data.forEach((row) => {
        const cnpj = row['CNPJ'] || row['cnpj'];
        if (cnpj && String(cnpj).match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)) {
          const client = db.prepare('SELECT id FROM clients WHERE cnpj = ?').get(cnpj);
          if (client) result.success++;
          else result.errors.push(`CNPJ não encontrado: ${cnpj}`);
        }
      });
    }

    // FATURAMENTO foi removido da planilha — agora vem do OneDrive
    // Abas esperadas: GASTOS REP, GASTOS VEND, REEMBOLSO, VB MKT, RETIRADA PROV, PROVISÃO
    const validSheets = ['GASTOS REP','GASTOS VEND','REEMBOLSO','VB MKT','RETIRADA PROV','PROVISÃO'];
    const foundSheets = wb.SheetNames.filter(s => validSheets.some(v => s.toUpperCase().includes(v.toUpperCase())));
    if (foundSheets.length > 0) { result.sheets.push(...foundSheets); result.success += foundSheets.length; }

    db.prepare('UPDATE upload_history SET status=?, records_success=?, records_error=?, error_log=? WHERE id=?')
      .run('completed', result.success, result.errors.length, JSON.stringify(result.errors), histId);

    res.json({ success: true, result });
  } catch (err) {
    db.prepare('UPDATE upload_history SET status=?, error_log=? WHERE id=?').run('failed', err.message, histId);
    res.status(500).json({ error: 'Erro ao processar arquivo: ' + err.message });
  }
});

router.get('/history', (req, res) => {
  const history = db.prepare('SELECT uh.*, u.name as uploader FROM upload_history uh JOIN users u ON uh.user_id = u.id ORDER BY uh.created_at DESC LIMIT 20').all();
  res.json(history);
});

module.exports = router;
