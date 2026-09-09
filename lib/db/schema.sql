-- BudgetOS — schema local (SQLite)
--
-- Tradução das migrations Postgres para o servidor local. Diferenças
-- deliberadas em relação ao original:
--
--   * Sem RLS e sem vault.access_key_hash — o app roda em localhost e a
--     proteção real é a da conta do Windows.
--   * Ids são gerados pela aplicação (crypto.randomUUID), não pelo banco:
--     evita repetir um gerador de uuid em SQL em cada tabela.
--   * numeric(12,2) vira REAL. O arredondamento continua em lib/finance,
--     que já era a fonte da verdade.
--   * booleanos viram INTEGER 0/1, convertidos na borda do repositório.
--
-- Colunas geradas e cascatas são mantidas: são regras que o banco garante
-- melhor do que código de aplicação.

CREATE TABLE IF NOT EXISTS vault (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  investment_goal REAL NOT NULL DEFAULT 0 CHECK (investment_goal >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS months (
  id TEXT PRIMARY KEY,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2200),
  starting_balance REAL NOT NULL DEFAULT 0,
  salary REAL NOT NULL DEFAULT 0,
  extra_income REAL NOT NULL DEFAULT 0,
  bank_balance REAL NOT NULL DEFAULT 0,
  reserved_fixed_expenses REAL NOT NULL DEFAULT 0,
  reserved_investment REAL NOT NULL DEFAULT 0,
  reserved_invoices REAL NOT NULL DEFAULT 0,
  available_balance REAL NOT NULL DEFAULT 0,
  closed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (year, month)
);

CREATE TABLE IF NOT EXISTS fixed_expenses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount >= 0),
  due_day INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS fixed_expense_payments (
  id TEXT PRIMARY KEY,
  month_id TEXT NOT NULL REFERENCES months (id) ON DELETE CASCADE,
  fixed_expense_id TEXT NOT NULL REFERENCES fixed_expenses (id) ON DELETE CASCADE,
  amount REAL NOT NULL CHECK (amount >= 0),
  paid_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (month_id, fixed_expense_id)
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  emoji TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  default_limit REAL NOT NULL DEFAULT 0 CHECK (default_limit >= 0),
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS monthly_category_budgets (
  id TEXT PRIMARY KEY,
  month_id TEXT NOT NULL REFERENCES months (id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  planned_limit REAL NOT NULL DEFAULT 0,
  current_limit REAL NOT NULL DEFAULT 0,
  spent REAL NOT NULL DEFAULT 0,
  remaining REAL GENERATED ALWAYS AS (current_limit - spent) STORED,
  UNIQUE (month_id, category_id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  month_id TEXT NOT NULL REFERENCES months (id) ON DELETE CASCADE,
  category_id TEXT REFERENCES categories (id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income', 'adjustment', 'investment')),
  amount REAL NOT NULL CHECK (amount > 0),
  description TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai', 'simulation')),
  date TEXT NOT NULL DEFAULT (date('now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS balance_adjustments (
  id TEXT PRIMARY KEY,
  month_id TEXT NOT NULL REFERENCES months (id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('entry', 'exit', 'correction', 'transfer')),
  amount REAL NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS investments (
  id TEXT PRIMARY KEY,
  month_id TEXT NOT NULL REFERENCES months (id) ON DELETE CASCADE,
  amount REAL NOT NULL CHECK (amount > 0),
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY,
  month_id TEXT REFERENCES months (id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS recurring_incomes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0 CHECK (amount >= 0),
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS credit_cards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  closing_day INTEGER NOT NULL CHECK (closing_day BETWEEN 1 AND 31),
  due_day INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  credit_limit REAL NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
  color TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS card_purchases (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES credit_cards (id) ON DELETE CASCADE,
  category_id TEXT REFERENCES categories (id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  total_amount REAL NOT NULL CHECK (total_amount > 0),
  installments_count INTEGER NOT NULL DEFAULT 1 CHECK (installments_count BETWEEN 1 AND 120),
  first_installment_no INTEGER NOT NULL DEFAULT 1 CHECK (first_installment_no >= 1),
  purchase_date TEXT NOT NULL DEFAULT (date('now')),
  first_charge_year INTEGER NOT NULL CHECK (first_charge_year BETWEEN 2000 AND 2200),
  first_charge_month INTEGER NOT NULL CHECK (first_charge_month BETWEEN 1 AND 12),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (first_installment_no <= installments_count)
);

CREATE TABLE IF NOT EXISTS card_installments (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL REFERENCES card_purchases (id) ON DELETE CASCADE,
  installment_no INTEGER NOT NULL CHECK (installment_no >= 1),
  year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2200),
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount REAL NOT NULL CHECK (amount >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (purchase_id, installment_no)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0 CHECK (amount >= 0),
  billing_day INTEGER NOT NULL CHECK (billing_day BETWEEN 1 AND 31),
  payment_method TEXT NOT NULL DEFAULT 'credit' CHECK (payment_method IN ('credit', 'debit')),
  card_id TEXT REFERENCES credit_cards (id) ON DELETE SET NULL,
  category_id TEXT REFERENCES categories (id) ON DELETE SET NULL,
  start_year INTEGER,
  start_month INTEGER CHECK (start_month IS NULL OR start_month BETWEEN 1 AND 12),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (payment_method <> 'credit' OR card_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS card_invoices (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES credit_cards (id) ON DELETE CASCADE,
  year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2200),
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  installments_total REAL NOT NULL DEFAULT 0 CHECK (installments_total >= 0),
  subscriptions_total REAL NOT NULL DEFAULT 0 CHECK (subscriptions_total >= 0),
  declared_total REAL CHECK (declared_total IS NULL OR declared_total >= 0),
  total REAL GENERATED ALWAYS AS (
    COALESCE(declared_total, installments_total + subscriptions_total)
  ) STORED,
  due_date TEXT NOT NULL,
  paid INTEGER NOT NULL DEFAULT 0,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (card_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_transactions_month ON transactions (month_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (date DESC);
CREATE INDEX IF NOT EXISTS idx_budgets_month ON monthly_category_budgets (month_id);
CREATE INDEX IF NOT EXISTS idx_adjustments_month ON balance_adjustments (month_id);
CREATE INDEX IF NOT EXISTS idx_investments_month ON investments (month_id);
CREATE INDEX IF NOT EXISTS idx_payments_month ON fixed_expense_payments (month_id);
CREATE INDEX IF NOT EXISTS idx_categories_sort ON categories (sort_order);
CREATE INDEX IF NOT EXISTS idx_ai_created ON ai_conversations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_installments_competence ON card_installments (year, month);
CREATE INDEX IF NOT EXISTS idx_invoices_competence ON card_invoices (year, month);
