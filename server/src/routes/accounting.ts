import { Router } from "express";
import { getDb } from "../db/database.js";
import { runAccountingAgent } from "../services/accounting-agent.js";
import { logger } from "../logger.js";
import type {
  AccountingRecord,
  AccountingFieldIssue,
  BankTransaction,
} from "../types/models.js";

export const accountingRouter = Router();

// ---------------------------------------------------------------------------
// GET /api/accounting
// List accounting records with optional filters
// ---------------------------------------------------------------------------
accountingRouter.get("/", (req, res) => {
  try {
    const db = getDb();

    const {
      belegart,
      status,
      from,
      to,
      missing_fields,
      page = "1",
      limit = "50",
    } = req.query as Record<string, string | undefined>;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (belegart) {
      const belege = belegart.split(",").map((b) => b.trim()).filter(Boolean);
      if (belege.length > 0) {
        conditions.push(
          `ar.belegart IN (${belege.map(() => "?").join(",")})`
        );
        params.push(...belege);
      }
    }

    if (status) {
      const statuses = status.split(",").map((s) => s.trim()).filter(Boolean);
      if (statuses.length > 0) {
        conditions.push(
          `ar.accounting_status IN (${statuses.map(() => "?").join(",")})`
        );
        params.push(...statuses);
      }
    }

    if (from) {
      conditions.push("ar.rechnungsdatum >= ?");
      params.push(from);
    }

    if (to) {
      conditions.push("ar.rechnungsdatum <= ?");
      params.push(to);
    }

    if (missing_fields === "true") {
      conditions.push(
        `EXISTS (
          SELECT 1 FROM accounting_field_issues afi
          WHERE afi.accounting_record_id = ar.id
            AND afi.issue_type = 'missing_field'
            AND afi.severity = 'error'
            AND afi.resolved = 0
        )`
      );
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const pageNum = Math.max(1, parseInt(page ?? "1", 10));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit ?? "50", 10)));
    const offset = (pageNum - 1) * limitNum;

    const total = (
      db.prepare(`SELECT COUNT(*) as cnt FROM accounting_records ar ${where}`).get(...params) as {
        cnt: number;
      }
    ).cnt;

    const records = db
      .prepare(
        `SELECT ar.*, d.original_filename, d.status as doc_status
         FROM accounting_records ar
         JOIN documents d ON d.id = ar.document_id
         ${where}
         ORDER BY ar.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limitNum, offset) as (AccountingRecord & {
        original_filename: string;
        doc_status: string;
      })[];

    // Parse offene_fragen JSON for each record
    const enriched = records.map((r) => ({
      ...r,
      offene_fragen: (() => {
        try {
          return JSON.parse(r.offene_fragen);
        } catch {
          return [];
        }
      })(),
    }));

    res.json({ records: enriched, total, page: pageNum, limit: limitNum });
  } catch (err) {
    logger.error({ err }, "GET /api/accounting failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/accounting/summary
// Monthly aggregation: Einnahmen, Ausgaben, USt
// ---------------------------------------------------------------------------
accountingRouter.get("/summary", (req, res) => {
  try {
    const db = getDb();
    const { from, to } = req.query as Record<string, string | undefined>;

    const conditions = ["ar.accounting_status = 'confirmed'"];
    const params: unknown[] = [];

    if (from) {
      conditions.push("ar.rechnungsdatum >= ?");
      params.push(from);
    }
    if (to) {
      conditions.push("ar.rechnungsdatum <= ?");
      params.push(to);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const row = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN ar.belegart = 'ausgangsrechnung' THEN ar.netto_betrag ELSE 0 END), 0) AS einnahmen_netto,
        COALESCE(SUM(CASE WHEN ar.belegart = 'eingangsrechnung' THEN ar.netto_betrag ELSE 0 END), 0) AS ausgaben_netto,
        COALESCE(SUM(CASE WHEN ar.belegart = 'ausgangsrechnung' THEN ar.ust_betrag ELSE 0 END), 0) AS ust_eingenommen,
        COALESCE(SUM(CASE WHEN ar.belegart = 'eingangsrechnung' THEN ar.ust_betrag ELSE 0 END), 0) AS ust_gezahlt,
        COUNT(CASE WHEN ar.belegart = 'ausgangsrechnung' AND ar.zahlungsstatus = 'offen' THEN 1 END) AS offene_forderungen_count,
        COALESCE(SUM(CASE WHEN ar.belegart = 'ausgangsrechnung' AND ar.zahlungsstatus = 'offen' THEN ar.brutto_betrag ELSE 0 END), 0) AS offene_forderungen_betrag,
        COUNT(CASE WHEN ar.belegart = 'eingangsrechnung' AND ar.zahlungsstatus = 'offen' THEN 1 END) AS offene_verbindlichkeiten_count,
        COALESCE(SUM(CASE WHEN ar.belegart = 'eingangsrechnung' AND ar.zahlungsstatus = 'offen' THEN ar.brutto_betrag ELSE 0 END), 0) AS offene_verbindlichkeiten_betrag
      FROM accounting_records ar
      ${where}
    `).get(...params) as Record<string, number>;

    const fehlendeBelege = (
      db.prepare(`
        SELECT COUNT(*) as cnt
        FROM accounting_field_issues afi
        JOIN accounting_records ar ON ar.id = afi.accounting_record_id
        WHERE afi.severity = 'error' AND afi.resolved = 0 ${from ? "AND ar.rechnungsdatum >= ?" : ""} ${to ? "AND ar.rechnungsdatum <= ?" : ""}
      `).get(...(from ? [from] : []), ...(to ? [to] : [])) as { cnt: number }
    ).cnt;

    const klaerungsbedarf = (
      db.prepare(`
        SELECT COUNT(*) as cnt FROM accounting_records ar ${where.replace("'confirmed'", "'needs_clarification'")}
      `).get(...params) as { cnt: number }
    ).cnt;

    res.json({
      einnahmen_netto: row.einnahmen_netto,
      ausgaben_netto: row.ausgaben_netto,
      ust_eingenommen: row.ust_eingenommen,
      ust_gezahlt: row.ust_gezahlt,
      ust_zahllast: row.ust_eingenommen - row.ust_gezahlt,
      offene_forderungen_count: row.offene_forderungen_count,
      offene_forderungen_betrag: row.offene_forderungen_betrag,
      offene_verbindlichkeiten_count: row.offene_verbindlichkeiten_count,
      offene_verbindlichkeiten_betrag: row.offene_verbindlichkeiten_betrag,
      fehlende_belege: fehlendeBelege,
      klaerungsbedarf,
    });
  } catch (err) {
    logger.error({ err }, "GET /api/accounting/summary failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/accounting/vat-report
// Umsatzsteuervoranmeldung data for a period
// ---------------------------------------------------------------------------
accountingRouter.get("/vat-report", (req, res) => {
  try {
    const db = getDb();
    const { from, to } = req.query as Record<string, string | undefined>;

    const conditions = ["ar.accounting_status = 'confirmed'"];
    const params: unknown[] = [];
    if (from) { conditions.push("ar.rechnungsdatum >= ?"); params.push(from); }
    if (to) { conditions.push("ar.rechnungsdatum <= ?"); params.push(to); }
    const where = `WHERE ${conditions.join(" AND ")}`;

    const rows = db.prepare(`
      SELECT
        ar.ust_satz,
        ar.belegart,
        COALESCE(SUM(ar.netto_betrag), 0) AS netto_summe,
        COALESCE(SUM(ar.ust_betrag), 0) AS ust_summe,
        COUNT(*) AS belege_count
      FROM accounting_records ar
      ${where}
      GROUP BY ar.belegart, ar.ust_satz
      ORDER BY ar.belegart, ar.ust_satz
    `).all(...params);

    res.json({ period: { from: from ?? null, to: to ?? null }, rows });
  } catch (err) {
    logger.error({ err }, "GET /api/accounting/vat-report failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/accounting/open-items
// Open receivables and payables
// ---------------------------------------------------------------------------
accountingRouter.get("/open-items", (req, res) => {
  try {
    const db = getDb();

    const openItems = db.prepare(`
      SELECT ar.*, d.original_filename
      FROM accounting_records ar
      JOIN documents d ON d.id = ar.document_id
      WHERE ar.zahlungsstatus IN ('offen', 'teilweise_bezahlt')
        AND ar.belegart IN ('eingangsrechnung', 'ausgangsrechnung')
        AND ar.accounting_status = 'confirmed'
      ORDER BY ar.faelligkeitsdatum ASC
    `).all() as (AccountingRecord & { original_filename: string })[];

    const enriched = openItems.map((r) => ({
      ...r,
      offene_fragen: (() => { try { return JSON.parse(r.offene_fragen); } catch { return []; } })(),
    }));

    res.json({ items: enriched, total: enriched.length });
  } catch (err) {
    logger.error({ err }, "GET /api/accounting/open-items failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/accounting/export
// CSV or DATEV export
// ---------------------------------------------------------------------------
accountingRouter.get("/export", (req, res) => {
  try {
    const db = getDb();
    const { format = "csv", from, to } = req.query as Record<string, string | undefined>;

    const conditions = ["ar.accounting_status = 'confirmed'"];
    const params: unknown[] = [];
    if (from) { conditions.push("ar.rechnungsdatum >= ?"); params.push(from); }
    if (to) { conditions.push("ar.rechnungsdatum <= ?"); params.push(to); }
    const where = `WHERE ${conditions.join(" AND ")}`;

    const records = db.prepare(`
      SELECT ar.*, d.original_filename
      FROM accounting_records ar
      JOIN documents d ON d.id = ar.document_id
      ${where}
      ORDER BY ar.rechnungsdatum ASC
    `).all(...params) as (AccountingRecord & { original_filename: string })[];

    if (format === "datev") {
      // DATEV Buchungsstapel ASCII format (simplified header + data rows)
      const lines: string[] = [];
      lines.push(
        '"EXTF";700;21;"Buchungsstapel";4;20240101;;"";"";"";"";;;"";"EUR";"";;;"";;;'
      );
      lines.push(
        "Umsatz (ohne Soll/Haben-Kz);Soll/Haben-Kennzeichen;WKZ Umsatz;Kurs;Basis-Umsatz;WKZ Basis-Umsatz;Konto;Gegenkonto (ohne BU-Schlüssel);BU-Schlüssel;Belegdatum;Belegnummer;Buchungstext;"
      );

      for (const r of records) {
        const betrag = r.brutto_betrag?.toFixed(2) ?? "";
        const sollHaben = r.belegart === "eingangsrechnung" ? "H" : "S";
        const konto = r.skr_konto ?? "";
        const gegenkonto =
          r.belegart === "eingangsrechnung" ? "1600" : "1400";
        const belegart = r.rechnungsdatum
          ? r.rechnungsdatum.replace(/-/g, "").substring(4, 8) // DDMM
          : "";
        const belegnr = r.rechnungsnummer ?? "";
        const buchungstext = (r.aussteller ?? r.original_filename ?? "")
          .substring(0, 60)
          .replace(/[";]/g, "");

        lines.push(
          `"${betrag}";"${sollHaben}";"EUR";"";"";"";${konto};${gegenkonto};;${belegart};"${belegnr}";"${buchungstext}";`
        );
      }

      res.setHeader("Content-Type", "text/csv; charset=UTF-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="EXTF_Buchungsstapel.csv"'
      );
      res.send(lines.join("\r\n"));
      return;
    }

    // Generic CSV
    const csvLines: string[] = [
      [
        "Belegart",
        "Rechnungsnummer",
        "Rechnungsdatum",
        "Aussteller",
        "Empfänger",
        "Netto",
        "USt-Satz",
        "USt",
        "Brutto",
        "Zahlungsstatus",
        "SKR-Konto",
        "SKR-Kontoname",
        "Dateiname",
      ].join(";"),
    ];

    for (const r of records) {
      csvLines.push(
        [
          r.belegart,
          r.rechnungsnummer ?? "",
          r.rechnungsdatum ?? "",
          (r.aussteller ?? "").replace(/;/g, ","),
          (r.empfaenger ?? "").replace(/;/g, ","),
          r.netto_betrag?.toFixed(2) ?? "",
          r.ust_satz != null ? `${(r.ust_satz * 100).toFixed(0)}%` : "",
          r.ust_betrag?.toFixed(2) ?? "",
          r.brutto_betrag?.toFixed(2) ?? "",
          r.zahlungsstatus,
          r.skr_konto ?? "",
          (r.skr_konto_name ?? "").replace(/;/g, ","),
          r.original_filename,
        ].join(";")
      );
    }

    res.setHeader("Content-Type", "text/csv; charset=UTF-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="Buchungsexport.csv"'
    );
    res.send(csvLines.join("\r\n"));
  } catch (err) {
    logger.error({ err }, "GET /api/accounting/export failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/accounting/:documentId
// Full accounting record for a document
// ---------------------------------------------------------------------------
accountingRouter.get("/:documentId", (req, res) => {
  try {
    const db = getDb();
    const documentId = parseInt(req.params.documentId, 10);

    if (isNaN(documentId)) {
      res.status(400).json({ error: "Invalid document ID" });
      return;
    }

    const record = db
      .prepare("SELECT * FROM accounting_records WHERE document_id = ?")
      .get(documentId) as AccountingRecord | undefined;

    if (!record) {
      res.status(404).json({ error: "No accounting record found for this document" });
      return;
    }

    const issues = db
      .prepare(
        "SELECT * FROM accounting_field_issues WHERE accounting_record_id = ? ORDER BY severity DESC"
      )
      .all(record.id) as AccountingFieldIssue[];

    const transactions = db
      .prepare(
        "SELECT * FROM bank_transactions WHERE accounting_record_id = ? ORDER BY buchungsdatum ASC"
      )
      .all(record.id) as BankTransaction[];

    res.json({
      ...record,
      offene_fragen: (() => {
        try {
          return JSON.parse(record.offene_fragen);
        } catch {
          return [];
        }
      })(),
      issues,
      bank_transactions: transactions,
    });
  } catch (err) {
    logger.error({ err }, "GET /api/accounting/:documentId failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/accounting/:documentId/confirm
// Operator confirms the accounting record
// ---------------------------------------------------------------------------
accountingRouter.patch("/:documentId/confirm", (req, res) => {
  try {
    const db = getDb();
    const documentId = parseInt(req.params.documentId, 10);

    if (isNaN(documentId)) {
      res.status(400).json({ error: "Invalid document ID" });
      return;
    }

    const record = db
      .prepare("SELECT id FROM accounting_records WHERE document_id = ?")
      .get(documentId) as { id: number } | undefined;

    if (!record) {
      res.status(404).json({ error: "No accounting record found" });
      return;
    }

    db.prepare(`
      UPDATE accounting_records
      SET accounting_status = 'confirmed', confirmed_at = datetime('now')
      WHERE id = ?
    `).run(record.id);

    res.json({ message: "Accounting record confirmed", documentId });
  } catch (err) {
    logger.error({ err }, "PATCH /api/accounting/:documentId/confirm failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/accounting/:documentId/fields
// Operator updates extracted accounting fields
// ---------------------------------------------------------------------------
accountingRouter.patch("/:documentId/fields", (req, res) => {
  try {
    const db = getDb();
    const documentId = parseInt(req.params.documentId, 10);

    if (isNaN(documentId)) {
      res.status(400).json({ error: "Invalid document ID" });
      return;
    }

    const record = db
      .prepare("SELECT id FROM accounting_records WHERE document_id = ?")
      .get(documentId) as { id: number } | undefined;

    if (!record) {
      res.status(404).json({ error: "No accounting record found" });
      return;
    }

    // Only allow updating specific safe fields
    const allowedFields = new Set([
      "aussteller",
      "empfaenger",
      "rechnungsnummer",
      "rechnungsdatum",
      "leistungsdatum",
      "faelligkeitsdatum",
      "netto_betrag",
      "ust_satz",
      "ust_betrag",
      "brutto_betrag",
      "iban",
      "verwendungszweck",
      "zahlungsstatus",
      "skr_konto",
      "skr_konto_name",
    ]);

    const updates = req.body as Record<string, unknown>;
    const setClauses: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (!allowedFields.has(key)) continue;
      setClauses.push(`${key} = ?`);
      values.push(value);
    }

    if (setClauses.length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    // Reset to review after manual field edit
    setClauses.push("accounting_status = 'review'");
    values.push(record.id);

    db.prepare(
      `UPDATE accounting_records SET ${setClauses.join(", ")} WHERE id = ?`
    ).run(...values);

    res.json({ message: "Accounting fields updated", documentId });
  } catch (err) {
    logger.error({ err }, "PATCH /api/accounting/:documentId/fields failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/accounting/:documentId/reprocess
// Re-run the accounting agent on a document
// ---------------------------------------------------------------------------
accountingRouter.post("/:documentId/reprocess", async (req, res) => {
  try {
    const db = getDb();
    const documentId = parseInt(req.params.documentId, 10);

    if (isNaN(documentId)) {
      res.status(400).json({ error: "Invalid document ID" });
      return;
    }

    const extractedData = db
      .prepare("SELECT raw_text FROM extracted_data WHERE document_id = ?")
      .get(documentId) as { raw_text: string | null } | undefined;

    if (!extractedData?.raw_text) {
      res.status(422).json({
        error: "No OCR text found for this document. Run OCR processing first.",
      });
      return;
    }

    // Run agent async — respond immediately
    res.json({ message: "Reprocessing started", documentId });

    runAccountingAgent(documentId, extractedData.raw_text).catch((err) => {
      logger.error({ documentId, err }, "Reprocess accounting agent failed");
    });
  } catch (err) {
    logger.error({ err }, "POST /api/accounting/:documentId/reprocess failed");
    res.status(500).json({ error: "Internal server error" });
  }
});
