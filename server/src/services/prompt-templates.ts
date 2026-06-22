import type { DocumentType } from "../types/models.js";

const SYSTEM_PROMPT =
  "You are a document analysis AI. You extract structured information from document text. Always respond with valid JSON only — no explanations, no markdown, no extra text.";

export function buildClassificationPrompt(
  text: string,
  documentTypes: DocumentType[]
): string {
  const typeList = documentTypes
    .map((t) => `- "${t.name}": ${t.description}`)
    .join("\n");

  return `Classify the following document into one of these types:

${typeList}

Respond with a JSON object containing:
- "type": the document type name (must be one of the listed types)
- "confidence": a number between 0 and 1 indicating your confidence

Document text:
---
${truncateText(text, 3000)}
---

Respond with JSON only.`;
}

export function buildExtractionPrompt(
  text: string,
  extractionPrompt: string
): string {
  return `${extractionPrompt}

Document text:
---
${truncateText(text, 3000)}
---

Respond with JSON only.`;
}

export function buildSummaryPrompt(text: string): string {
  return `Summarize the following document in 2-4 sentences. Focus on the key information: what type of document it is, the main parties or entities involved, key dates, and the primary purpose.

Document text:
---
${truncateText(text, 3000)}
---

Respond with a JSON object containing:
- "summary": the document summary (2-4 sentences)

Respond with JSON only.`;
}

export function buildSentimentPrompt(text: string): string {
  return `Analyze the tone and intent of the following document.

Document text:
---
${truncateText(text, 2000)}
---

Respond with a JSON object containing:
- "sentiment": one of "neutral", "positive", "negative", "urgent", "formal", "informal"
- "intent": a brief description of the document's purpose (1 sentence)

Respond with JSON only.`;
}

export function getSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

// ---------------------------------------------------------------------------
// Accounting Agent prompt templates (German bookkeeping)
// ---------------------------------------------------------------------------

const ACCOUNTING_SYSTEM_PROMPT =
  "Du bist ein deutschsprachiger Buchhalter-Assistent. Antworte ausschließlich mit gültigem JSON — keine Erklärungen, kein Markdown, kein Fließtext.";

export function getAccountingSystemPrompt(): string {
  return ACCOUNTING_SYSTEM_PROMPT;
}

export function buildBelegarttDetectionPrompt(text: string): string {
  return `Klassifiziere das folgende OCR-Dokument als genau einen der folgenden Belegarten:
eingangsrechnung, ausgangsrechnung, quittung, kontoauszug, mahnung, lohnabrechnung, vertrag, datev_export, unbekannt

Antworte NUR mit einem JSON-Objekt:
{"belegart": "<type>", "confidence": <0.0-1.0>}

Dokumenttext:
---
${truncateText(text, 3000)}
---

Antworte mit JSON.`;
}

export function buildAccountingFieldExtractionPrompt(text: string): string {
  return `Du bist ein deutschsprachiger Buchhalter-Assistent. Extrahiere alle buchhalterischen Felder aus dem folgenden Dokumenttext gemäß §14 UStG.
Antworte NUR mit einem gültigen JSON-Objekt mit genau diesen Schlüsseln (null für fehlende Felder):
{
  "aussteller": null,
  "empfaenger": null,
  "rechnungsnummer": null,
  "rechnungsdatum": null,
  "leistungsdatum": null,
  "faelligkeitsdatum": null,
  "netto_betrag": null,
  "ust_satz": null,
  "ust_betrag": null,
  "brutto_betrag": null,
  "iban": null,
  "verwendungszweck": null,
  "zahlungsstatus": null,
  "offene_fragen": []
}
Regeln:
- Geldbeträge als Zahlen ohne Währungssymbol (z.B. 119.00)
- Datumsangaben im Format YYYY-MM-DD
- Umsatzsteuersatz als Dezimalzahl (0.19, 0.07, 0.0)
- zahlungsstatus: "offen", "bezahlt", "teilweise_bezahlt" oder null
- offene_fragen: Array von deutschen Strings mit Klärungsbedarf

Dokumenttext:
---
${truncateText(text, 3000)}
---

Antworte mit JSON.`;
}

export function buildSkrMappingPrompt(
  belegart: string,
  description: string
): string {
  return `Du bist ein deutschsprachiger Buchhalter, der mit SKR03 und SKR04 vertraut ist.
Schlage für den folgenden Beleg die passende SKR03-Kontonummer und den Kontonamen vor.
Antworte NUR mit JSON: {"konto": "<4-stellige Nummer>", "name": "<Kontoname>", "confidence": <0.0-1.0>}
Bei Unsicherheit: confidence unter 0.5 setzen.

Belegart: ${belegart}
Beschreibung: ${truncateText(description, 500)}

Antworte mit JSON.`;
}

export function buildZusammenfassungPrompt(fieldsJson: string): string {
  return `Du bist ein deutschsprachiger Buchhalter-Assistent. Erstelle eine strukturierte Zusammenfassung des folgenden Buchhaltungsdokuments auf Deutsch.
Verwende dieses Format exakt:

Zusammenfassung:
- Belegart:
- Aussteller:
- Empfänger:
- Rechnungsdatum:
- Rechnungsnummer:
- Netto:
- Umsatzsteuer:
- Brutto:
- Zahlungsstatus:
- Empfohlene Buchungskategorie:
- Offene Fragen:

Wichtig: Wenn Felder fehlen oder steuerrechtlich unklar sind, weise explizit darauf hin und empfehle, einen Steuerberater zu konsultieren.

Extrahierte Felder:
${fieldsJson}

Antworte NUR mit dem formatierten Zusammenfassungstext (kein JSON).`;
}

function truncateText(text: string, maxTokensApprox: number): string {
  // Rough approximation: 1 token ≈ 4 characters
  const maxChars = maxTokensApprox * 4;
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars) + "\n[... Text gekürzt ...]";
}

// ---------------------------------------------------------------------------
// Vision LLM prompts — used when the document image is passed directly
// ---------------------------------------------------------------------------

/**
 * Vision classification prompt: classify document from image into known types.
 */
export function buildVisionClassificationPrompt(types: Array<{ name: string; description: string }>): string {
  const typeList = types.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  return `You are a document classification expert. Look at the full layout of this document image — headers, logos, tables, stamps, footers — and classify it as exactly one of the following types:

${typeList}

Pay attention to visual structure (column layout, table borders, header blocks) which text alone may not convey.

Respond ONLY with a valid JSON object on a single line:
{"type": "<type_name>", "confidence": <0.0-1.0>}`;
}

/**
 * Vision Belegart detection prompt: classify from image as a German accounting document type.
 */
export function buildVisionBelegarttDetectionPrompt(): string {
  return `You are a German accounting document classifier. Examine the full visual layout of this document image carefully — headers, column structure, logos, table rows, and footers.

Classify it as exactly one of these German accounting document types:
- eingangsrechnung: incoming invoice (the company is the buyer/recipient)
- ausgangsrechnung: outgoing invoice (the company is the seller/issuer)
- quittung: receipt or cash register slip
- kontoauszug: bank account statement
- mahnung: payment reminder / dunning notice
- lohnabrechnung: payroll / salary statement
- vertrag: contract or framework agreement
- datev_export: DATEV CSV or Excel export file
- unbekannt: none of the above

The visual layout provides crucial context:
- Invoices typically have a two-column header (issuer left, invoice metadata right)
- Bank statements have transaction rows with date / description / amount columns
- Payroll shows employee name, gross pay, deductions table

Respond ONLY with valid JSON on a single line:
{"belegart": "<type>", "confidence": <0.0-1.0>}`;
}

/**
 * Vision accounting field extraction prompt: extract §14 UStG fields from document image.
 */
export function buildVisionAccountingFieldExtractionPrompt(): string {
  return `You are a German bookkeeping assistant. Examine this document image carefully, paying close attention to the visual layout:

- The ISSUER (Aussteller) is typically in the TOP-LEFT header block (company name, address)
- The RECIPIENT (Empfänger) is in the TOP-RIGHT header or below "An:" / "Rechnungsempfänger:"
- Line items (Positionen) are in the central table
- Totals (Netto, USt, Brutto) are in the BOTTOM-RIGHT summary block
- Payment details (IBAN, Verwendungszweck) are in the footer

Extract all accounting fields and return ONLY a valid JSON object with these exact keys (use null for any field not found):
{
  "aussteller": null,
  "empfaenger": null,
  "rechnungsnummer": null,
  "rechnungsdatum": null,
  "leistungsdatum": null,
  "faelligkeitsdatum": null,
  "netto_betrag": null,
  "ust_satz": null,
  "ust_betrag": null,
  "brutto_betrag": null,
  "iban": null,
  "verwendungszweck": null,
  "zahlungsstatus": null,
  "offene_fragen": []
}

Rules:
- All monetary values as numbers (no currency symbols, no thousands separators)
- Dates as YYYY-MM-DD strings
- VAT rate (ust_satz) as decimal: 0.19, 0.07, or 0.0
- zahlungsstatus: "offen", "bezahlt", "teilweise_bezahlt", or null
- offene_fragen: array of strings for any ambiguous or unclear fields`;
}

// ---------------------------------------------------------------------------
// Receipt line-item extraction prompts (vision LLM — quittung / Kassenbon)
// ---------------------------------------------------------------------------

/**
 * Vision prompt: extract every line item from a receipt image.
 * Handles German VAT markers (A=19%, B=7%, C=0%), quantities, discounts, Pfand.
 */
export function buildVisionReceiptItemExtractionPrompt(): string {
  return `You are a German receipt analysis expert. Look at this receipt image carefully.

Extract EVERY line item. German receipts use these VAT markers in a column on the right:
- A = 19% VAT (standard rate — most non-food items)
- B = 7% VAT (reduced rate — food, books, newspapers, etc.)
- C or * = 0% VAT

For each item extract:
- description: product name exactly as printed on the receipt
- quantity: number (default 1.0 if not explicitly shown)
- unit: unit of measure — "kg", "Stk", "l", "m", "Paar" — or null if not shown
- unit_price: price per unit as a number (null if not shown)
- total_price: total line price as a positive number; use a NEGATIVE number for Pfand returns, discounts, or refunds
- vat_rate: decimal VAT rate — 0.19, 0.07, or 0.0

Include ALL of the following as separate items with the appropriate total_price:
- Discount lines (negative total_price)
- Pfand deposits (positive) and Pfand returns (negative)
- Coupons or loyalty deductions (negative total_price)

Return ONLY a valid JSON object on a single line:
{
  "items": [
    { "description": "Milch 1,5%", "quantity": 2, "unit": "l", "unit_price": 0.99, "total_price": 1.98, "vat_rate": 0.07 },
    { "description": "Pfand EINWEG", "quantity": 1, "unit": null, "unit_price": 0.25, "total_price": 0.25, "vat_rate": 0.19 }
  ],
  "store_name": "REWE",
  "receipt_date": "2026-05-31",
  "total": 24.57
}

Rules:
- All monetary values as numbers without currency symbols or thousands separators
- Use the dot as decimal separator in your JSON output
- receipt_date as YYYY-MM-DD string, or null if not readable
- total is the grand total printed on the receipt (null if not readable)
- Do NOT skip items or merge items — each printed line is a separate array entry`;
}

/**
 * Vision prompt: classify receipt items into bookkeeping categories.
 * All items are sent in a single batch to minimise LLM round-trips.
 *
 * @param items  Array of {idx, description} objects
 */
export function buildReceiptItemCategoryPrompt(
  items: Array<{ idx: number; description: string }>
): string {
  const categories = [
    "Office Supplies",
    "IT Equipment",
    "IT Software / SaaS",
    "Fuel",
    "Vehicle Costs",
    "Food & Beverages (Business)",
    "Postage & Shipping",
    "Cleaning & Hygiene",
    "Books & Training",
    "Private (non-deductible)",
    "Other / Uncategorized",
  ]
    .map((c) => `- ${c}`)
    .join("\n");

  const itemsJson = JSON.stringify(items);

  return `You are a German bookkeeping assistant. Classify each receipt line item into exactly one category.

Available categories:
${categories}

Guidelines:
- "Office Supplies": pens, paper, folders, printer cartridges, staplers
- "IT Equipment": laptops, cables, USB sticks, keyboards, screens, chargers
- "IT Software / SaaS": software, apps, licenses, digital subscriptions
- "Fuel": petrol, diesel, AdBlue, E10, Super
- "Vehicle Costs": car wash, parking, engine oil, tyres, windshield fluid
- "Food & Beverages (Business)": meals or drinks for client meetings or team events — NOT personal grocery shopping
- "Postage & Shipping": stamps, parcel fees, courier, DHL, UPS
- "Cleaning & Hygiene": hand soap, disinfectant, cleaning spray, tissue, mop, bin bags for office use
- "Books & Training": professional books, online courses, seminars, trade magazines
- "Private (non-deductible)": clearly personal items — personal food, clothing, entertainment
- "Other / Uncategorized": anything that does not clearly fit any category above

Items to classify:
${itemsJson}

Return ONLY a JSON array with one entry per item:
[{"idx": 0, "category": "Fuel", "confidence": 0.95}, ...]`;
}
