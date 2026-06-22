import { getDb } from "../db/database.js";
import { detectBelegart, isAccountingDocument } from "./belegart-detector.js";
import { extractAccountingFields } from "./accounting-field-extractor.js";
import { validateVat } from "./vat-validator.js";
import { checkCompleteness } from "./completeness-checker.js";
import { mapSkrAccount } from "./skr-mapper.js";
import { generateZusammenfassung } from "./zusammenfassung-generator.js";
import { logger } from "../logger.js";
import type { VatIssue } from "./vat-validator.js";
import type { CompletenessIssue } from "./completeness-checker.js";

type AnyIssue = VatIssue | CompletenessIssue;

/**
 * Main entry point for the German Bookkeeping AI Agent.
 * Called by the Processing Pipeline after general document classification.
 *
 * @param documentId  The database document ID
 * @param rawText     OCR text (used as fallback when vision is unavailable)
 * @param imagePath   Optional path to the preprocessed document image; when
 *                    provided the vision LLM is used as the primary extraction path.
 *
 * Writes to:
 *   - accounting_records
 *   - accounting_field_issues
 *   - bank_transactions (for kontoauszug)
 *
 * Never throws — all errors are logged and the agent degrades gracefully.
 */
export async function runAccountingAgent(
  documentId: number,
  rawText: string,
  imagePath?: string
): Promise<void> {
  const db = getDb();
  const logCtx = { documentId };

  logger.info(logCtx, "Accounting agent started");

  try {
    // Step 1: Detect Belegart
    const { belegart, confidence: belegarttConfidence } = await detectBelegart(rawText, imagePath);
    logger.info({ ...logCtx, belegart, belegarttConfidence }, "Belegart detected");

    if (!isAccountingDocument(belegart)) {
      logger.info(logCtx, "Document is not an accounting document — skipping agent");
      return;
    }

    // Step 2: Extract §14 UStG fields
    const fields = await extractAccountingFields(rawText, imagePath);

    // Step 3: Validate VAT (deterministic)
    const vatIssues = validateVat(fields, belegart);

    // Step 4: Completeness check (deterministic)
    const completenessIssues = checkCompleteness(fields, belegart);

    // Step 5: Map SKR account
    const descriptionForSkr = [
      fields.aussteller,
      fields.verwendungszweck,
      rawText.substring(0, 500),
    ]
      .filter(Boolean)
      .join(" ");

    const skr = await mapSkrAccount(belegart, descriptionForSkr, fields.ust_satz);

    // Step 6: Generate Zusammenfassung
    const zusammenfassung = await generateZusammenfassung(fields, belegart, skr);

    // Step 7: Determine accounting_status
    const allIssues: AnyIssue[] = [...vatIssues, ...completenessIssues];
    const hasErrors = allIssues.some((i) => i.severity === "error");
    const hasSteuerberaterRequired = allIssues.some(
      (i) => i.issue_type === "steuerberater_required"
    );
    const accountingStatus =
      hasErrors || hasSteuerberaterRequired ? "needs_clarification" : "review";

    // Step 8: Write accounting_records (upsert — idempotent for re-processing)
    db.prepare(`
      INSERT INTO accounting_records (
        document_id, belegart, belegart_confidence,
        aussteller, empfaenger, rechnungsnummer,
        rechnungsdatum, leistungsdatum, faelligkeitsdatum,
        netto_betrag, ust_satz, ust_betrag, brutto_betrag,
        iban, verwendungszweck,
        skr_konto, skr_konto_name, skr_confidence,
        zahlungsstatus, zusammenfassung, offene_fragen,
        accounting_status, created_at
      ) VALUES (
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, datetime('now')
      )
      ON CONFLICT(document_id) DO UPDATE SET
        belegart = excluded.belegart,
        belegart_confidence = excluded.belegart_confidence,
        aussteller = excluded.aussteller,
        empfaenger = excluded.empfaenger,
        rechnungsnummer = excluded.rechnungsnummer,
        rechnungsdatum = excluded.rechnungsdatum,
        leistungsdatum = excluded.leistungsdatum,
        faelligkeitsdatum = excluded.faelligkeitsdatum,
        netto_betrag = excluded.netto_betrag,
        ust_satz = excluded.ust_satz,
        ust_betrag = excluded.ust_betrag,
        brutto_betrag = excluded.brutto_betrag,
        iban = excluded.iban,
        verwendungszweck = excluded.verwendungszweck,
        skr_konto = excluded.skr_konto,
        skr_konto_name = excluded.skr_konto_name,
        skr_confidence = excluded.skr_confidence,
        zahlungsstatus = excluded.zahlungsstatus,
        zusammenfassung = excluded.zusammenfassung,
        offene_fragen = excluded.offene_fragen,
        accounting_status = excluded.accounting_status
    `).run(
      documentId,
      belegart,
      belegarttConfidence,
      fields.aussteller,
      fields.empfaenger,
      fields.rechnungsnummer,
      fields.rechnungsdatum,
      fields.leistungsdatum,
      fields.faelligkeitsdatum,
      fields.netto_betrag,
      fields.ust_satz,
      fields.ust_betrag,
      fields.brutto_betrag,
      fields.iban,
      fields.verwendungszweck,
      skr.konto || null,
      skr.name || null,
      skr.confidence,
      fields.zahlungsstatus ?? "unbekannt",
      zusammenfassung,
      JSON.stringify(fields.offene_fragen),
      accountingStatus
    );

    // Retrieve the inserted/updated record id
    const record = db
      .prepare("SELECT id FROM accounting_records WHERE document_id = ?")
      .get(documentId) as { id: number } | undefined;

    if (!record) {
      logger.error(logCtx, "Failed to retrieve accounting_record id after upsert");
      return;
    }

    const recordId = record.id;

    // Step 9: Delete old issues for this record (re-processing scenario)
    db.prepare("DELETE FROM accounting_field_issues WHERE accounting_record_id = ?").run(
      recordId
    );

    // Step 10: Insert field issues
    const insertIssue = db.prepare(`
      INSERT INTO accounting_field_issues (
        accounting_record_id, issue_type, field_name, description, severity
      ) VALUES (?, ?, ?, ?, ?)
    `);

    const insertAllIssues = db.transaction((issues: AnyIssue[]) => {
      for (const issue of issues) {
        insertIssue.run(
          recordId,
          issue.issue_type,
          issue.field_name ?? null,
          issue.description,
          issue.severity
        );
      }
    });

    insertAllIssues(allIssues);

    // Step 11: For Kontoauszug — extract bank transactions
    if (belegart === "kontoauszug") {
      await extractBankTransactions(recordId, rawText, db);
    }

    logger.info(
      {
        ...logCtx,
        belegart,
        accountingStatus,
        issueCount: allIssues.length,
        skrKonto: skr.konto,
      },
      "Accounting agent completed"
    );
  } catch (err) {
    // Agent errors never fail the main pipeline
    logger.error({ ...logCtx, err }, "Accounting agent encountered unexpected error");
  }
}

/**
 * Extracts individual bank transaction lines from a Kontoauszug OCR text.
 * Simple heuristic line-based parser — not LLM-based.
 */
async function extractBankTransactions(
  recordId: number,
  rawText: string,
  db: ReturnType<typeof getDb>
): Promise<void> {
  // Delete previous transactions for this record (idempotent re-processing)
  db.prepare("DELETE FROM bank_transactions WHERE accounting_record_id = ?").run(recordId);

  // Heuristic: look for lines with a date pattern + amount pattern
  const dateAmountPattern =
    /(\d{2}[.\-/]\d{2}[.\-/]\d{2,4})\s+(.{5,80}?)\s+([-+]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))\s*(?:EUR|€)?/g;

  const lines = rawText.split("\n");
  const insertTx = db.prepare(`
    INSERT INTO bank_transactions (
      accounting_record_id, buchungsdatum, betrag, waehrung,
      sender_empfaenger, verwendungszweck, status
    ) VALUES (?, ?, ?, 'EUR', ?, ?, 'unmatched')
  `);

  let txCount = 0;

  const insertAll = db.transaction(() => {
    for (const line of lines) {
      let match: RegExpExecArray | null;
      dateAmountPattern.lastIndex = 0;
      while ((match = dateAmountPattern.exec(line)) !== null) {
        const [, rawDate, description, rawAmount] = match;

        // Normalize date to YYYY-MM-DD
        const dateParts = rawDate.split(/[.\-/]/);
        let buchungsdatum: string | null = null;
        if (dateParts.length === 3) {
          const [d, m, y] = dateParts;
          const year = y.length === 2 ? `20${y}` : y;
          buchungsdatum = `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
        }

        // Normalize amount (European format: 1.234,56 → 1234.56)
        const normalizedAmount = rawAmount
          .replace(/\./g, "")
          .replace(",", ".");
        const betrag = parseFloat(normalizedAmount);
        if (isNaN(betrag)) continue;

        insertTx.run(recordId, buchungsdatum, betrag, description.trim(), description.trim());
        txCount++;
      }
    }
  });

  insertAll();
  logger.info({ recordId, txCount }, "Bank transactions extracted from Kontoauszug");
}
