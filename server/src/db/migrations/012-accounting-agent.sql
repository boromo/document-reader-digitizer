-- Accounting Agent tables
-- Based on ARCHITECTURE.md Section 13.6

CREATE TABLE accounting_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
  belegart TEXT NOT NULL DEFAULT 'unbekannt'
    CHECK (belegart IN (
      'eingangsrechnung','ausgangsrechnung','quittung',
      'kontoauszug','mahnung','lohnabrechnung','vertrag',
      'datev_export','unbekannt'
    )),
  belegart_confidence REAL NOT NULL DEFAULT 0,
  aussteller TEXT,
  empfaenger TEXT,
  rechnungsnummer TEXT,
  rechnungsdatum TEXT,
  leistungsdatum TEXT,
  faelligkeitsdatum TEXT,
  netto_betrag REAL,
  ust_satz REAL,
  ust_betrag REAL,
  brutto_betrag REAL,
  iban TEXT,
  verwendungszweck TEXT,
  skr_konto TEXT,
  skr_konto_name TEXT,
  skr_confidence REAL,
  zahlungsstatus TEXT NOT NULL DEFAULT 'unbekannt'
    CHECK (zahlungsstatus IN ('offen','bezahlt','teilweise_bezahlt','unbekannt')),
  zusammenfassung TEXT,
  offene_fragen TEXT NOT NULL DEFAULT '[]',
  accounting_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (accounting_status IN ('pending','review','confirmed','needs_clarification')),
  confirmed_by INTEGER REFERENCES users(id),
  confirmed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE accounting_field_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  accounting_record_id INTEGER NOT NULL REFERENCES accounting_records(id) ON DELETE CASCADE,
  issue_type TEXT NOT NULL
    CHECK (issue_type IN (
      'missing_field','vat_mismatch','duplicate_suspected',
      'legal_warning','steuerberater_required'
    )),
  field_name TEXT,
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info','warning','error')),
  resolved INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE bank_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  accounting_record_id INTEGER NOT NULL REFERENCES accounting_records(id) ON DELETE CASCADE,
  buchungsdatum TEXT,
  betrag REAL,
  waehrung TEXT NOT NULL DEFAULT 'EUR',
  sender_empfaenger TEXT,
  verwendungszweck TEXT,
  matched_invoice_id INTEGER REFERENCES documents(id),
  booking_category TEXT,
  status TEXT NOT NULL DEFAULT 'unmatched'
    CHECK (status IN ('matched','unmatched','needs_clarification'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_accounting_records_document_id
  ON accounting_records(document_id);
CREATE INDEX IF NOT EXISTS idx_accounting_records_status
  ON accounting_records(accounting_status);
CREATE INDEX IF NOT EXISTS idx_accounting_records_belegart
  ON accounting_records(belegart);
CREATE INDEX IF NOT EXISTS idx_accounting_records_rechnungsdatum
  ON accounting_records(rechnungsdatum);
CREATE INDEX IF NOT EXISTS idx_accounting_field_issues_record
  ON accounting_field_issues(accounting_record_id);
CREATE INDEX IF NOT EXISTS idx_accounting_field_issues_severity
  ON accounting_field_issues(accounting_record_id, severity);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_record
  ON bank_transactions(accounting_record_id);
