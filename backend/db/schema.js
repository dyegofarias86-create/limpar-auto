const { DatabaseSync } = require('node:sqlite');
const path = require('path');

// Use env var for Railway volumes, fallback to local path in dev
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'limpar.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('leader', 'representative', 'seller')),
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS representatives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      leader_id INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (leader_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS sellers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      representative_id INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (representative_id) REFERENCES representatives(id)
    );
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_name TEXT NOT NULL,
      dealer_name TEXT NOT NULL,
      store_name TEXT NOT NULL,
      brand TEXT,
      state TEXT,
      city TEXT,
      cnpj TEXT UNIQUE,
      active INTEGER DEFAULT 1,
      email TEXT,
      representative_id INTEGER,
      seller_id INTEGER,
      provision_per_tmo REAL DEFAULT 0,
      FOREIGN KEY (representative_id) REFERENCES representatives(id),
      FOREIGN KEY (seller_id) REFERENCES sellers(id)
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('representative', 'seller', 'reimbursement')),
      category TEXT NOT NULL,
      description TEXT,
      amount REAL NOT NULL DEFAULT 0,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      week INTEGER,
      destination TEXT,
      representative_id INTEGER,
      seller_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (representative_id) REFERENCES representatives(id),
      FOREIGN KEY (seller_id) REFERENCES sellers(id)
    );
    CREATE TABLE IF NOT EXISTS reimbursements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      representative_id INTEGER,
      seller_id INTEGER,
      category TEXT NOT NULL,
      description TEXT,
      amount REAL NOT NULL DEFAULT 0,
      date TEXT,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS marketing_budget (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      representative_id INTEGER NOT NULL,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      tmo_qty REAL DEFAULT 0,
      rate REAL DEFAULT 0.25,
      total_budget REAL DEFAULT 0,
      used_budget REAL DEFAULT 0,
      available_budget REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(representative_id, month, year),
      FOREIGN KEY (representative_id) REFERENCES representatives(id)
    );
    CREATE TABLE IF NOT EXISTS marketing_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      marketing_budget_id INTEGER NOT NULL,
      description TEXT,
      amount REAL NOT NULL,
      date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (marketing_budget_id) REFERENCES marketing_budget(id)
    );
    CREATE TABLE IF NOT EXISTS provisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      representative_id INTEGER NOT NULL,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      tmo_qty REAL DEFAULT 0,
      provision_per_tmo REAL DEFAULT 0,
      monthly_provision REAL DEFAULT 0,
      previous_balance REAL DEFAULT 0,
      total_provision REAL DEFAULT 0,
      withdrawn REAL DEFAULT 0,
      current_balance REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(client_id, month, year),
      FOREIGN KEY (client_id) REFERENCES clients(id),
      FOREIGN KEY (representative_id) REFERENCES representatives(id)
    );
    CREATE TABLE IF NOT EXISTS provision_withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provision_id INTEGER NOT NULL,
      representative_id INTEGER NOT NULL,
      client_id INTEGER,
      description TEXT,
      amount REAL NOT NULL,
      date TEXT,
      reversed INTEGER DEFAULT 0,
      reversed_at TEXT,
      reversed_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (provision_id) REFERENCES provisions(id)
    );
    CREATE TABLE IF NOT EXISTS billing (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      representative_id INTEGER NOT NULL,
      seller_id INTEGER,
      client_id INTEGER NOT NULL,
      product TEXT NOT NULL,
      unit_price REAL DEFAULT 0,
      qty REAL DEFAULT 0,
      total REAL DEFAULT 0,
      invoice_number TEXT,
      due_date TEXT,
      email_recipient TEXT,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      nf_issued INTEGER DEFAULT 0,
      nf_sent INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (representative_id) REFERENCES representatives(id),
      FOREIGN KEY (client_id) REFERENCES clients(id)
    );
    CREATE TABLE IF NOT EXISTS agenda_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      representative_id INTEGER NOT NULL,
      client_id INTEGER,
      date TEXT NOT NULL,
      time TEXT DEFAULT '09:00',
      duration INTEGER DEFAULT 60,
      week INTEGER,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      client_name TEXT,
      title TEXT,
      visit_report TEXT,
      difficulties TEXT,
      action_plan TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (representative_id) REFERENCES representatives(id)
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      type        TEXT NOT NULL DEFAULT 'info',
      title       TEXT NOT NULL,
      body        TEXT,
      source      TEXT,
      source_id   INTEGER,
      actor_id    INTEGER,
      actor_name  TEXT,
      read_by     TEXT DEFAULT '[]',
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS upload_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      records_success INTEGER DEFAULT 0,
      records_error INTEGER DEFAULT 0,
      error_log TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
  console.log('✅ Database schema initialized');
}

module.exports = { db, initializeDatabase };
