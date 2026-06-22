import type { AccountingFields } from "./accounting-field-extractor.js";
import type { Belegart } from "./belegart-detector.js";

export interface CompletenessIssue {
  issue_type: "missing_field" | "legal_warning" | "steuerberater_required";
  field_name: string | null;
  description: string;
  severity: "info" | "warning" | "error";
}

// §14 Abs. 4 UStG mandatory fields for full invoices (> 250 EUR gross)
const FULL_INVOICE_REQUIRED_FIELDS: Array<{
  key: keyof AccountingFields;
  label: string;
  paragraph: string;
}> = [
  { key: "aussteller", label: "Aussteller (Name + Anschrift)", paragraph: "§14 Abs. 4 Nr. 1 UStG" },
  { key: "empfaenger", label: "Empfänger (Name + Anschrift)", paragraph: "§14 Abs. 4 Nr. 2 UStG" },
  { key: "rechnungsdatum", label: "Rechnungsdatum", paragraph: "§14 Abs. 4 Nr. 4 UStG" },
  { key: "rechnungsnummer", label: "Rechnungsnummer", paragraph: "§14 Abs. 4 Nr. 5 UStG" },
  { key: "leistungsdatum", label: "Leistungs-/Lieferdatum", paragraph: "§14 Abs. 4 Nr. 6 UStG" },
  { key: "netto_betrag", label: "Nettobetrag", paragraph: "§14 Abs. 4 Nr. 7 UStG" },
  { key: "ust_satz", label: "Umsatzsteuersatz", paragraph: "§14 Abs. 4 Nr. 8 UStG" },
  { key: "ust_betrag", label: "Umsatzsteuerbetrag", paragraph: "§14 Abs. 4 Nr. 8 UStG" },
  { key: "brutto_betrag", label: "Bruttobetrag", paragraph: "§14 Abs. 4 Nr. 8 UStG" },
];

// §33 UStDV reduced set for Kleinbetragsrechnungen ≤ 250 EUR gross
const KLEINBETRAG_REQUIRED_FIELDS: Array<{
  key: keyof AccountingFields;
  label: string;
  paragraph: string;
}> = [
  { key: "aussteller", label: "Aussteller", paragraph: "§33 UStDV" },
  { key: "rechnungsdatum", label: "Rechnungsdatum", paragraph: "§33 UStDV" },
  { key: "brutto_betrag", label: "Bruttobetrag", paragraph: "§33 UStDV" },
  { key: "ust_satz", label: "Umsatzsteuersatz", paragraph: "§33 UStDV" },
];

const KLEINBETRAG_THRESHOLD = 250;

// Document types that require §14 UStG field checks
const INVOICE_BELEGARTEN = new Set<Belegart>([
  "eingangsrechnung",
  "ausgangsrechnung",
]);

// Document types with special steuerberater warnings
const STEUERBERATER_BELEGARTEN = new Set<Belegart>([
  "lohnabrechnung",
  "jahresabschluss" as Belegart, // future-proofing
]);

function isFieldPresent(fields: AccountingFields, key: keyof AccountingFields): boolean {
  const val = fields[key];
  if (val === null || val === undefined) return false;
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === "string") return val.trim().length > 0;
  return true;
}

/**
 * Checks mandatory field completeness per §14 UStG and §33 UStDV.
 * No LLM — fully deterministic.
 */
export function checkCompleteness(
  fields: AccountingFields,
  belegart: Belegart
): CompletenessIssue[] {
  const issues: CompletenessIssue[] = [];

  if (INVOICE_BELEGARTEN.has(belegart)) {
    const grossAmount = fields.brutto_betrag;
    const isKleinbetrag =
      grossAmount !== null && grossAmount <= KLEINBETRAG_THRESHOLD;

    const requiredFields = isKleinbetrag
      ? KLEINBETRAG_REQUIRED_FIELDS
      : FULL_INVOICE_REQUIRED_FIELDS;

    const thresholdNote = isKleinbetrag
      ? " (Kleinbetragsrechnung ≤ 250 EUR gem. §33 UStDV)"
      : " (Vollrechnung gem. §14 Abs. 4 UStG)";

    for (const field of requiredFields) {
      if (!isFieldPresent(fields, field.key)) {
        issues.push({
          issue_type: "missing_field",
          field_name: field.key,
          description: `Pflichtfeld fehlt${thresholdNote}: ${field.label} (${field.paragraph}).`,
          severity: "error",
        });
      }
    }

    // Warn if VAT fields appear to be completely absent (could be steuerfreie Leistung)
    if (
      fields.ust_satz === null &&
      fields.ust_betrag === null &&
      grossAmount !== null
    ) {
      issues.push({
        issue_type: "legal_warning",
        field_name: "ust_satz",
        description:
          "Kein Umsatzsteuersatz erkannt. Falls es sich um eine steuerfreie Leistung (§4 UStG) oder Kleinunternehmer (§19 UStG) handelt, bitte prüfen und bestätigen.",
        severity: "warning",
      });
    }
  }

  // Lohnabrechnung always needs professional payroll processing
  if (STEUERBERATER_BELEGARTEN.has(belegart)) {
    issues.push({
      issue_type: "steuerberater_required",
      field_name: null,
      description:
        "Lohnabrechnungen müssen durch eine zugelassene Lohnbuchhaltungssoftware oder einen Steuerberater verarbeitet werden. Dieser Assistent bereitet die Daten nur vor.",
      severity: "warning",
    });
  }

  // Vertrag: flag for potential ongoing obligations
  if (belegart === "vertrag") {
    issues.push({
      issue_type: "legal_warning",
      field_name: null,
      description:
        "Verträge können steuerrechtlich relevante Dauerverpflichtungen enthalten. Bitte mit Steuerberater abstimmen.",
      severity: "info",
    });
  }

  return issues;
}
