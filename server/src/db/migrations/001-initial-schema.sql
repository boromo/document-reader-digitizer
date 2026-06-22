-- Initial schema for Document Reader & Digitizer
-- Based on ARCHITECTURE.md Section 4: Data Architecture

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT
);

CREATE TABLE document_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  extraction_prompt TEXT
);

CREATE TABLE documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_filename TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  thumbnail_path TEXT,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  upload_date TEXT NOT NULL DEFAULT (datetime('now')),
  uploaded_by INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'review', 'confirmed', 'rejected'))
);

CREATE TABLE extracted_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
  raw_text TEXT,
  summary TEXT,
  sentiment TEXT,
  ocr_confidence REAL,
  processed_at TEXT
);

CREATE TABLE classifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
  ai_suggested_type TEXT,
  ai_confidence REAL,
  confirmed_type TEXT,
  confirmed_by INTEGER REFERENCES users(id),
  confirmed_at TEXT
);

CREATE TABLE extracted_fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_value TEXT,
  confidence REAL,
  ai_suggested_value TEXT,
  confirmed_value TEXT
);

CREATE TABLE processing_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0
);

-- Full-text search index on extracted document content
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  raw_text,
  summary,
  content='extracted_data',
  content_rowid='id'
);

-- Triggers to keep FTS index in sync
CREATE TRIGGER extracted_data_ai AFTER INSERT ON extracted_data BEGIN
  INSERT INTO documents_fts(rowid, raw_text, summary)
  VALUES (new.id, new.raw_text, new.summary);
END;

CREATE TRIGGER extracted_data_ad AFTER DELETE ON extracted_data BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, raw_text, summary)
  VALUES ('delete', old.id, old.raw_text, old.summary);
END;

CREATE TRIGGER extracted_data_au AFTER UPDATE ON extracted_data BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, raw_text, summary)
  VALUES ('delete', old.id, old.raw_text, old.summary);
  INSERT INTO documents_fts(rowid, raw_text, summary)
  VALUES (new.id, new.raw_text, new.summary);
END;

-- Indexes for common queries
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_uploaded_by ON documents(uploaded_by);
CREATE INDEX idx_documents_upload_date ON documents(upload_date);
CREATE INDEX idx_extracted_fields_document_id ON extracted_fields(document_id);
CREATE INDEX idx_processing_jobs_status ON processing_jobs(status);

-- Seed default document types
INSERT INTO document_types (name, description, extraction_prompt) VALUES
  ('invoice', 'Invoices and billing documents', 'Extract the following fields from this invoice: invoice_number, date, due_date, vendor_name, vendor_address, total_amount, currency, line_items (description, quantity, unit_price, amount). Return as JSON.'),
  ('receipt', 'Purchase receipts', 'Extract the following fields from this receipt: store_name, date, items (name, price), subtotal, tax, total_amount, payment_method. Return as JSON.'),
  ('contract', 'Contracts and legal agreements', 'Extract the following fields from this contract: parties (names), effective_date, expiration_date, contract_type, key_terms, signatures. Return as JSON.'),
  ('id_document', 'Identity documents (passports, licenses, IDs)', 'Extract the following fields from this identity document: document_type, full_name, date_of_birth, document_number, expiry_date, issuing_authority, nationality. Return as JSON.'),
  ('medical_record', 'Medical and health records', 'Extract the following fields from this medical record: patient_name, date, provider_name, diagnosis, medications, procedures, notes. Return as JSON.'),
  ('form', 'Forms and applications', 'Extract all filled fields from this form. Return field labels and their values as JSON key-value pairs.'),
  ('letter', 'Letters and correspondence', 'Extract the following fields from this letter: sender, recipient, date, subject, key_points. Return as JSON.'),
  ('report', 'Reports and memos', 'Extract the following fields from this report: title, author, date, executive_summary, key_findings. Return as JSON.'),
  ('other', 'Uncategorized documents', 'Extract any identifiable structured fields from this document. Return as JSON with descriptive field names.');
