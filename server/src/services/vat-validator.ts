import type { AccountingFields } from "./accounting-field-extractor.js";
import type { Belegart } from "./belegart-detector.js";

export interface VatIssue {
  issue_type: "vat_mismatch" | "missing_field";
  field_name: string | null;
  description: string;
  severity: "info" | "warning" | "error";
}

const TOLERANCE = 0.02; // EUR rounding tolerance
const VALID_RATES = new Set([0, 0.07, 0.19]);

/**
 * Deterministic VAT rule engine — no LLM.
 * Checks arithmetic consistency of Netto / USt / Brutto fields.
 */
export function validateVat(
  fields: AccountingFields,
  _belegart: Belegart
): VatIssue[] {
  const issues: VatIssue[] = [];

  const { netto_betrag, ust_satz, ust_betrag, brutto_betrag } = fields;

  // VAT-001: ust_satz must be a known German rate
  if (ust_satz !== null) {
    if (!VALID_RATES.has(ust_satz)) {
      issues.push({
        issue_type: "vat_mismatch",
        field_name: "ust_satz",
        description: `Unbekannter Umsatzsteuersatz: ${(ust_satz * 100).toFixed(0)}%. Erlaubte Sätze: 0%, 7%, 19%.`,
        severity: "error",
      });
    }
  }

  // VAT-002: netto * ust_satz ≈ ust_betrag
  if (netto_betrag !== null && ust_satz !== null && ust_betrag !== null) {
    const expected = Math.round(netto_betrag * ust_satz * 100) / 100;
    if (Math.abs(expected - ust_betrag) > TOLERANCE) {
      issues.push({
        issue_type: "vat_mismatch",
        field_name: "ust_betrag",
        description: `USt-Betrag stimmt nicht: ${netto_betrag.toFixed(2)} × ${(ust_satz * 100).toFixed(0)}% = ${expected.toFixed(2)} EUR, aber Dokument zeigt ${ust_betrag.toFixed(2)} EUR.`,
        severity: "error",
      });
    }
  }

  // VAT-003: netto + ust_betrag ≈ brutto
  if (netto_betrag !== null && ust_betrag !== null && brutto_betrag !== null) {
    const expected = Math.round((netto_betrag + ust_betrag) * 100) / 100;
    if (Math.abs(expected - brutto_betrag) > TOLERANCE) {
      issues.push({
        issue_type: "vat_mismatch",
        field_name: "brutto_betrag",
        description: `Bruttobetrag stimmt nicht: ${netto_betrag.toFixed(2)} + ${ust_betrag.toFixed(2)} = ${expected.toFixed(2)} EUR, aber Dokument zeigt ${brutto_betrag.toFixed(2)} EUR.`,
        severity: "error",
      });
    }
  }

  // VAT-004: all three monetary fields should be present for Rechnungen
  const monetaryFields: Array<[string, number | null]> = [
    ["netto_betrag", netto_betrag],
    ["ust_betrag", ust_betrag],
    ["brutto_betrag", brutto_betrag],
  ];
  for (const [name, val] of monetaryFields) {
    if (val === null) {
      issues.push({
        issue_type: "missing_field",
        field_name: name,
        description: `Pflichtfeld "${name}" fehlt oder konnte nicht gelesen werden.`,
        severity: "warning",
      });
    }
  }

  // VAT-005: brutto must be positive
  if (brutto_betrag !== null && brutto_betrag <= 0) {
    issues.push({
      issue_type: "vat_mismatch",
      field_name: "brutto_betrag",
      description: `Bruttobetrag ist nicht positiv: ${brutto_betrag}. Bitte prüfen.`,
      severity: "warning",
    });
  }

  return issues;
}
