const bcrypt = require('bcryptjs');
const { db, initializeDatabase } = require('./schema');

initializeDatabase();

const hash = (password) => bcrypt.hashSync(password, 10);

// ── Usuários ──────────────────────────────────────────────────────
const users = [
  { name: 'Dyego (Líder)', email: 'lider@limpar.com', password: hash('limpar123'), role: 'leader' },
  // Representantes
  { name: 'EDNILSON', email: 'ednilson@limpar.com', password: hash('limpar123'), role: 'representative' },
  { name: 'DELIO',    email: 'delio@limpar.com',     password: hash('limpar123'), role: 'representative' },
  { name: 'BASE MG',  email: 'basemg@limpar.com',    password: hash('limpar123'), role: 'representative' },
  { name: 'WALLACE',  email: 'wallace@limpar.com',   password: hash('limpar123'), role: 'representative' },
  { name: 'DANIELA',  email: 'daniela@limpar.com',   password: hash('limpar123'), role: 'representative' },
  { name: 'JACKSON',  email: 'jackson@limpar.com',   password: hash('limpar123'), role: 'representative' },
  { name: 'OTÁVIO',  email: 'otavio@limpar.com',    password: hash('limpar123'), role: 'representative' },
  { name: 'ARTHUR',   email: 'arthur@limpar.com',    password: hash('limpar123'), role: 'representative' },
  // Vendedor exemplo (vinculado a EDNILSON)
  { name: 'ALEXANDRE ROSA', email: 'alexandre@limpar.com', password: hash('limpar123'), role: 'seller' },
];

const insertUser = db.prepare(`INSERT OR IGNORE INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`);
users.forEach(u => insertUser.run(u.name, u.email, u.password, u.role));

const lider = db.prepare('SELECT id FROM users WHERE email = ?').get('lider@limpar.com');
const repNames = ['EDNILSON','DELIO','BASE MG','WALLACE','DANIELA','JACKSON','OTÁVIO','ARTHUR'];
const repEmails = ['ednilson@limpar.com','delio@limpar.com','basemg@limpar.com','wallace@limpar.com','daniela@limpar.com','jackson@limpar.com','otavio@limpar.com','arthur@limpar.com'];
// DYEGO is leader but also a rep — added separately

// ── Representantes ────────────────────────────────────────────────
const insertRep = db.prepare(`INSERT OR IGNORE INTO representatives (user_id, leader_id) VALUES (?, ?)`);
repEmails.forEach(email => {
  const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (u) insertRep.run(u.id, lider.id);
});

// ── Vendedor vinculado ao EDNILSON ────────────────────────────────
const ednilsonUser = db.prepare('SELECT id FROM users WHERE email = ?').get('ednilson@limpar.com');
const ednilsonRep  = db.prepare('SELECT id FROM representatives WHERE user_id = ?').get(ednilsonUser.id);
const alexUser     = db.prepare('SELECT id FROM users WHERE email = ?').get('alexandre@limpar.com');
db.prepare(`INSERT OR IGNORE INTO sellers (user_id, representative_id) VALUES (?, ?)`).run(alexUser.id, ednilsonRep.id);
const alexSeller = db.prepare('SELECT id FROM sellers WHERE user_id = ?').get(alexUser.id);

// ── Clientes (reaproveitados da planilha de Adriano, agora sob EDNILSON) ──
const clientsData = [
  { group_name: 'CARHOUSE',  dealer_name: 'HYUNDAI CARHOUSE',  store_name: 'HYUNDAI SANTA MARIA',          brand: 'HYUNDAI', state: 'RS', city: 'SANTA MARIA',   cnpj: '11.472.103/0003-32', provision_per_tmo: 0  },
  { group_name: 'BADU',      dealer_name: 'COM AUTOPEÇAS BADU', store_name: 'BADU SÃO JOSE',               brand: 'MULTIMARCA', state: 'SC', city: 'SÃO JOSE',  cnpj: '76.344.696/0001-35', provision_per_tmo: 7  },
  { group_name: 'DVA',       dealer_name: 'DVA CAMINHÕES',      store_name: 'MB CAM SÃO JOSÉ DVA',         brand: 'MERCEDES CAMINHÕES', state: 'SC', city: 'SÃO JOSE',  cnpj: '82.516.949/0001-03', provision_per_tmo: 5  },
  { group_name: 'GERAÇÃO',   dealer_name: 'HYUNDAI GERAÇÃO',    store_name: 'HYUNDAI FLORIANOPOLIS',        brand: 'HYUNDAI', state: 'SC', city: 'FLORIANOPOLIS', cnpj: '10.459.491/0003-59', provision_per_tmo: 20 },
  { group_name: 'GERAÇÃO',   dealer_name: 'HYUNDAI GERAÇÃO',    store_name: 'HYUNDAI GERAÇÃO BRUSQUE',      brand: 'HYUNDAI', state: 'SC', city: 'BRUSQUE',       cnpj: '10.272.704/0001-77', provision_per_tmo: 20 },
  { group_name: 'GERAÇÃO',   dealer_name: 'HYUNDAI GERAÇÃO',    store_name: 'HYUNDAI GERAÇÃO RIO DO SUL',   brand: 'HYUNDAI', state: 'SC', city: 'RIO DO SUL',    cnpj: '10.459.491/0002-78', provision_per_tmo: 20 },
  { group_name: 'GERAÇÃO',   dealer_name: 'HYUNDAI GERAÇÃO',    store_name: 'HYUNDAI LAGES',                brand: 'HYUNDAI', state: 'SC', city: 'LAGES',         cnpj: '15.040.722/0001-47', provision_per_tmo: 20 },
  { group_name: 'GERAÇÃO',   dealer_name: 'HYUNDAI GERAÇÃO',    store_name: 'HYUNDAI SÃO JOSÉ',             brand: 'HYUNDAI', state: 'SC', city: 'SÃO JOSE',      cnpj: '10.459.491/0001-97', provision_per_tmo: 20 },
  { group_name: 'RF',        dealer_name: 'VW MAN RF',          store_name: 'VW MAN IÇARA',                brand: 'VW - MAN', state: 'SC', city: 'IÇARA',         cnpj: '05.010.520/0001-07', provision_per_tmo: 7  },
  { group_name: 'RF',        dealer_name: 'VW MAN RF',          store_name: 'VW MAN PALHOÇA',              brand: 'VW - MAN', state: 'SC', city: 'PALHOÇA',       cnpj: '78.824.224/0001-05', provision_per_tmo: 7  },
  { group_name: 'RF',        dealer_name: 'VW MAN RF',          store_name: 'VW MAN TIJUCAS',              brand: 'VW - MAN', state: 'SC', city: 'TIJUCAS',       cnpj: '78.824.224/0002-96', provision_per_tmo: 7  },
  { group_name: 'RF',        dealer_name: 'VW MAN RF',          store_name: 'VW MAN TUBARÃO',              brand: 'VW - MAN', state: 'SC', city: 'TUBARAO',       cnpj: '27.320.673/0001-85', provision_per_tmo: 7  },
  { group_name: 'W BREITKOPF', dealer_name: 'VW MAN W BREITKOPF', store_name: 'VW MAN BLUMENAU',         brand: 'VW - MAN', state: 'SC', city: 'BLUMENAU',       cnpj: '82.636.754/0001-05', provision_per_tmo: 5  },
  { group_name: 'W BREITKOPF', dealer_name: 'VW MAN W BREITKOPF', store_name: 'VW MAN GUARAMIRIM',       brand: 'VW - MAN', state: 'SC', city: 'GUARAMIRIM',     cnpj: '82.636.754/0003-69', provision_per_tmo: 5  },
  { group_name: 'W BREITKOPF', dealer_name: 'VW MAN W BREITKOPF', store_name: 'VW MAN RIO DO SUL',       brand: 'VW - MAN', state: 'SC', city: 'RIO DO SUL',     cnpj: '82.636.754/0008-73', provision_per_tmo: 5  },
  { group_name: 'PORTO SEGURO', dealer_name: 'GARAGEM 345',    store_name: 'PORTO SEGURO FLORIANOPOLIS',  brand: 'PORTO SEGURO', state: 'SC', city: 'FLORIANOPOLIS', cnpj: '39.598.980/0001-01', provision_per_tmo: 11 },
  { group_name: 'PORTO SEGURO', dealer_name: 'MARTINS FILIPPI', store_name: 'PORTO SEGURO SÃO JOSÉ',     brand: 'MULTIMARCA', state: 'SC', city: 'SÃO JOSE',    cnpj: '15.265.505/0001-55', provision_per_tmo: 5  },
];

const insertClient = db.prepare(`INSERT OR IGNORE INTO clients (group_name, dealer_name, store_name, brand, state, city, cnpj, representative_id, seller_id, provision_per_tmo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
clientsData.forEach(c => insertClient.run(c.group_name, c.dealer_name, c.store_name, c.brand, c.state, c.city, c.cnpj, ednilsonRep.id, alexSeller.id, c.provision_per_tmo));

// ── Gastos de exemplo (EDNILSON - Julho 2026) ────────────────────
const insertExpense = db.prepare(`INSERT OR IGNORE INTO expenses (type, category, description, amount, month, year, representative_id, seller_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
insertExpense.run('representative', 'Aluguel Veículo', 'Aluguel do carro - Julho', 2500, 7, 2026, ednilsonRep.id, null);
insertExpense.run('seller', 'Aluguel Veículo', 'Aluguel do carro - Julho', 1800, 7, 2026, ednilsonRep.id, alexSeller.id);
insertExpense.run('seller', 'Alimentação', 'Refeição base - 23 dias', 920, 7, 2026, ednilsonRep.id, alexSeller.id);

// ── Provisões de exemplo (EDNILSON - Julho 2026) ─────────────────
const provisionData = [
  { cnpj: '76.344.696/0001-35', qty: 31, prev_bal: 0 },
  { cnpj: '82.516.949/0001-03', qty: 16, prev_bal: 0 },
  { cnpj: '39.598.980/0001-01', qty: 39, prev_bal: 0 },
  { cnpj: '15.265.505/0001-55', qty: 44, prev_bal: 0 },
  { cnpj: '05.010.520/0001-07', qty: 240, prev_bal: 0 },
  { cnpj: '78.824.224/0001-05', qty: 347, prev_bal: 0 },
  { cnpj: '10.459.491/0001-97', qty: 175, prev_bal: 2000 },
  { cnpj: '10.459.491/0003-59', qty: 107, prev_bal: 1000 },
];

const insertProv = db.prepare(`INSERT OR IGNORE INTO provisions (client_id, representative_id, month, year, tmo_qty, provision_per_tmo, monthly_provision, previous_balance, total_provision, withdrawn, current_balance) VALUES ((SELECT id FROM clients WHERE cnpj = ? LIMIT 1), ?, ?, ?, ?, (SELECT provision_per_tmo FROM clients WHERE cnpj = ? LIMIT 1), ?, ?, ?, 0, ?)`);
provisionData.forEach(p => {
  const client = db.prepare('SELECT provision_per_tmo FROM clients WHERE cnpj = ?').get(p.cnpj);
  if (!client) return;
  const monthly = p.qty * client.provision_per_tmo;
  const total = monthly + p.prev_bal;
  try { insertProv.run(p.cnpj, ednilsonRep.id, 7, 2026, p.qty, p.cnpj, monthly, p.prev_bal, total, total); } catch(e) {}
});

// ── Verba MKT placeholder (será atualizada via sync OneDrive) ─────
// Faturamento virá do OneDrive - zero por padrão
const allReps = db.prepare('SELECT r.id FROM representatives r JOIN users u ON r.user_id = u.id').all();
allReps.forEach(r => {
  try {
    db.prepare(`INSERT OR IGNORE INTO marketing_budget (representative_id, month, year, tmo_qty, rate, total_budget, used_budget, available_budget) VALUES (?, 7, 2026, 0, 0.25, 0, 0, 0)`).run(r.id);
  } catch(e) {}
});

console.log('✅ Seed concluído!');
console.log('');
console.log('👤 Usuários:');
console.log('   Líder:       lider@limpar.com / limpar123');
console.log('   EDNILSON:    ednilson@limpar.com / limpar123');
console.log('   ARTHUR:      arthur@limpar.com / limpar123');
console.log('   JACKSON:     jackson@limpar.com / limpar123');
console.log('   WALLACE:     wallace@limpar.com / limpar123');
console.log('   DELIO:       delio@limpar.com / limpar123');
console.log('   BASE MG:     basemg@limpar.com / limpar123');
console.log('   DANIELA:     daniela@limpar.com / limpar123');
console.log('   OTÁVIO:     otavio@limpar.com / limpar123');
console.log('   Vendedor:    alexandre@limpar.com / limpar123');
console.log('');
console.log('⚠️  Faturamento: aguardando sync via OneDrive');
