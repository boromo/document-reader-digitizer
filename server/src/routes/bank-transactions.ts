import { Router } from "express";
import { getDb } from "../db/database.js";
import { logger } from "../logger.js";
import type { BankTransaction } from "../types/models.js";

export const bankTransactionsRouter = Router();

// ---------------------------------------------------------------------------
// GET /api/bank-transactions
// List bank transactions with optional filters
// ---------------------------------------------------------------------------
bankTransactionsRouter.get("/", (req, res) => {
  try {
    const db = getDb();
    const { status, from, to, page = "1", limit = "100" } = req.query as Record<
      string,
      string | undefined
    >;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status) {
      const statuses = status.split(",").map((s) => s.trim()).filter(Boolean);
      if (statuses.length > 0) {
        conditions.push(`bt.status IN (${statuses.map(() => "?").join(",")})`);
        params.push(...statuses);
      }
    }

    if (from) {
      conditions.push("bt.buchungsdatum >= ?");
      params.push(from);
    }

    if (to) {
      conditions.push("bt.buchungsdatum <= ?");
      params.push(to);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const pageNum = Math.max(1, parseInt(page ?? "1", 10));
    const limitNum = Math.min(500, Math.max(1, parseInt(limit ?? "100", 10)));
    const offset = (pageNum - 1) * limitNum;

    const total = (
      db.prepare(`SELECT COUNT(*) as cnt FROM bank_transactions bt ${where}`).get(
        ...params
      ) as { cnt: number }
    ).cnt;

    const transactions = db
      .prepare(
        `SELECT bt.*, ar.document_id, d.original_filename
         FROM bank_transactions bt
         JOIN accounting_records ar ON ar.id = bt.accounting_record_id
         JOIN documents d ON d.id = ar.document_id
         ${where}
         ORDER BY bt.buchungsdatum DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limitNum, offset) as (BankTransaction & {
        document_id: number;
        original_filename: string;
      })[];

    res.json({ transactions, total, page: pageNum, limit: limitNum });
  } catch (err) {
    logger.error({ err }, "GET /api/bank-transactions failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/bank-transactions/:id/match
// Manually match a bank transaction to a document (Rechnung)
// ---------------------------------------------------------------------------
bankTransactionsRouter.patch("/:id/match", (req, res) => {
  try {
    const db = getDb();
    const txId = parseInt(req.params.id, 10);

    if (isNaN(txId)) {
      res.status(400).json({ error: "Invalid transaction ID" });
      return;
    }

    const { matched_invoice_id, booking_category } = req.body as {
      matched_invoice_id?: number | null;
      booking_category?: string;
    };

    const tx = db
      .prepare("SELECT id FROM bank_transactions WHERE id = ?")
      .get(txId) as { id: number } | undefined;

    if (!tx) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }

    const newStatus =
      matched_invoice_id != null ? "matched" : "needs_clarification";

    db.prepare(`
      UPDATE bank_transactions
      SET matched_invoice_id = ?,
          booking_category = ?,
          status = ?
      WHERE id = ?
    `).run(
      matched_invoice_id ?? null,
      booking_category ?? null,
      newStatus,
      txId
    );

    res.json({ message: "Transaction updated", id: txId, status: newStatus });
  } catch (err) {
    logger.error({ err }, "PATCH /api/bank-transactions/:id/match failed");
    res.status(500).json({ error: "Internal server error" });
  }
});
