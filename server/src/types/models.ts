export type DocumentStatus = "pending" | "processing" | "review" | "confirmed" | "rejected";
export type JobStatus = "queued" | "running" | "completed" | "failed";

export interface User {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
  last_login: string | null;
}

export interface Document {
  id: number;
  original_filename: string;
  stored_path: string;
  thumbnail_path: string | null;
  mime_type: string;
  file_size_bytes: number;
  upload_date: string;
  uploaded_by: number | null;
  status: DocumentStatus;
}

export interface ExtractedData {
  id: number;
  document_id: number;
  raw_text: string | null;
  summary: string | null;
  sentiment: string | null;
  ocr_confidence: number | null;
  processed_at: string | null;
}

export interface Classification {
  id: number;
  document_id: number;
  ai_suggested_type: string | null;
  ai_confidence: number | null;
  confirmed_type: string | null;
  confirmed_by: number | null;
  confirmed_at: string | null;
}

export interface ExtractedField {
  id: number;
  document_id: number;
  field_name: string;
  field_value: string | null;
  confidence: number | null;
  ai_suggested_value: string | null;
  confirmed_value: string | null;
}

export interface DocumentType {
  id: number;
  name: string;
  description: string | null;
  extraction_prompt: string | null;
}

export interface ProcessingJob {
  id: number;
  document_id: number;
  status: JobStatus;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  retry_count: number;
}

export interface Tag {
  id: number;
  name: string;
}

export interface DocumentWithTags extends Document {
  tags: Tag[];
}

// ---------------------------------------------------------------------------
// Accounting Agent types
// ---------------------------------------------------------------------------

export type Belegart =
  | "eingangsrechnung"
  | "ausgangsrechnung"
  | "quittung"
  | "kontoauszug"
  | "mahnung"
  | "lohnabrechnung"
  | "vertrag"
  | "datev_export"
  | "unbekannt";

export type AccountingStatus = "pending" | "review" | "confirmed" | "needs_clarification";
export type Zahlungsstatus = "offen" | "bezahlt" | "teilweise_bezahlt" | "unbekannt";
export type IssueSeverity = "info" | "warning" | "error";
export type IssueType =
  | "missing_field"
  | "vat_mismatch"
  | "duplicate_suspected"
  | "legal_warning"
  | "steuerberater_required";

export interface AccountingRecord {
  id: number;
  document_id: number;
  belegart: Belegart;
  belegart_confidence: number;
  aussteller: string | null;
  empfaenger: string | null;
  rechnungsnummer: string | null;
  rechnungsdatum: string | null;
  leistungsdatum: string | null;
  faelligkeitsdatum: string | null;
  netto_betrag: number | null;
  ust_satz: number | null;
  ust_betrag: number | null;
  brutto_betrag: number | null;
  iban: string | null;
  verwendungszweck: string | null;
  skr_konto: string | null;
  skr_konto_name: string | null;
  skr_confidence: number | null;
  zahlungsstatus: Zahlungsstatus;
  zusammenfassung: string | null;
  offene_fragen: string; // JSON array
  accounting_status: AccountingStatus;
  confirmed_by: number | null;
  confirmed_at: string | null;
  created_at: string;
}

export interface AccountingFieldIssue {
  id: number;
  accounting_record_id: number;
  issue_type: IssueType;
  field_name: string | null;
  description: string;
  severity: IssueSeverity;
  resolved: number;
}

export interface BankTransaction {
  id: number;
  accounting_record_id: number;
  buchungsdatum: string | null;
  betrag: number | null;
  waehrung: string;
  sender_empfaenger: string | null;
  verwendungszweck: string | null;
  matched_invoice_id: number | null;
  booking_category: string | null;
  status: "matched" | "unmatched" | "needs_clarification";
}


export interface DocumentWithDetails extends Document {
  extracted_data: ExtractedData | null;
  classifications: Classification[] | null;
  extracted_fields: ExtractedField[] | null;
  document_type: DocumentType | null;
  processing_job: ProcessingJob | null;
  tags: Tag[];
}

// ---------------------------------------------------------------------------
// Receipt line-item types
// ---------------------------------------------------------------------------

export interface ItemCategory {
  id: number;
  name: string;
  description: string | null;
  skr03_konto: string | null;
  skr03_konto_name: string | null;
  parent_id: number | null;
  is_system_category: number;
}

export interface ReceiptItem {
  id: number;
  document_id: number;
  position: number;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price: number | null;
  total_price: number;
  vat_rate: number;
  vat_amount: number | null;
  ai_suggested_category_id: number | null;
  confirmed_category_id: number | null;
  confidence: number | null;
  created_at: string;
  // joined fields
  ai_suggested_category?: ItemCategory;
  confirmed_category?: ItemCategory;
}
