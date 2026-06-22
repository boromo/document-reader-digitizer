-- 013-receipt-items.sql
-- Adds item_categories (seeded) and receipt_items tables for quittung line-item extraction.

CREATE TABLE IF NOT EXISTS item_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  skr03_konto TEXT,
  skr03_konto_name TEXT,
  parent_id INTEGER REFERENCES item_categories(id),
  is_system_category INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS receipt_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT,
  unit_price REAL,
  total_price REAL NOT NULL,
  vat_rate REAL NOT NULL DEFAULT 0.19,
  vat_amount REAL,
  ai_suggested_category_id INTEGER REFERENCES item_categories(id),
  confirmed_category_id INTEGER REFERENCES item_categories(id),
  confidence REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_receipt_items_document_id ON receipt_items(document_id);

-- Seed system categories
INSERT OR IGNORE INTO item_categories (name, description, skr03_konto, skr03_konto_name, parent_id, is_system_category) VALUES
  ('Office Supplies',           'Pens, paper, folders, printer cartridges',                '4930', 'Bürobedarf',                             NULL, 1),
  ('IT Equipment',              'Laptops, cables, USB sticks, keyboards, screens',         '0680', 'Betriebs- und Geschäftsausstattung',     NULL, 1),
  ('IT Software / SaaS',        'Software licenses, app purchases, subscriptions',         '4960', 'Softwarekosten',                         NULL, 1),
  ('Fuel',                      'Petrol, diesel, AdBlue',                                  '4530', 'Kfz-Kosten',                             NULL, 1),
  ('Vehicle Costs',             'Car wash, parking, engine oil, tyres, accessories',       '4540', 'Sonstige Kfz-Kosten',                   NULL, 1),
  ('Food & Beverages (Business)','Business meals, client coffee, team catering',           '4650', 'Bewirtungskosten',                       NULL, 1),
  ('Postage & Shipping',        'Stamps, parcel fees, courier services',                   '4910', 'Porto',                                  NULL, 1),
  ('Cleaning & Hygiene',        'Office cleaning supplies, hand soap, disinfectants',      '4985', 'Reinigungskosten',                       NULL, 1),
  ('Books & Training',          'Professional books, online courses, seminars',            '4940', 'Aus- und Fortbildung',                   NULL, 1),
  ('Private (non-deductible)',  'Personal items on a mixed receipt — not tax-deductible',  NULL,   NULL,                                     NULL, 1),
  ('Other / Uncategorized',     'Fallback for items that do not fit any other category',   '4900', 'Sonstige betriebliche Aufwendungen',     NULL, 1);
