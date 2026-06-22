import { getDb } from "../db/database.js";
import { getVisionOllamaClient } from "./ollama-client.js";
import { documentToBase64 } from "./vision-extractor.js";
import {
  buildVisionReceiptItemExtractionPrompt,
  buildReceiptItemCategoryPrompt,
  getAccountingSystemPrompt,
} from "./prompt-templates.js";
import { logger } from "../logger.js";
import type { ItemCategory, ReceiptItem } from "../types/models.js";

// ---------------------------------------------------------------------------
// JSON parsing helper (shared pattern from vision-extractor)
// ---------------------------------------------------------------------------

function parseJsonResponse<T>(response: string): T {
  let cleaned = response.trim();
  const jsonBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonBlockMatch) cleaned = jsonBlockMatch[1].trim();
  // Try object first, then array
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  const jsonStr = objectMatch ?? arrayMatch;
  if (jsonStr) cleaned = jsonStr[0];
  return JSON.parse(cleaned) as T;
}

// ---------------------------------------------------------------------------
// Raw types returned by the vision LLM
// ---------------------------------------------------------------------------

interface RawReceiptItem {
  description: unknown;
  quantity?: unknown;
  unit?: unknown;
  unit_price?: unknown;
  total_price: unknown;
  vat_rate?: unknown;
}

interface RawExtractionResult {
  items: RawReceiptItem[];
  store_name?: unknown;
  receipt_date?: unknown;
  total?: unknown;
}

interface RawCategorySuggestion {
  idx: number;
  category: string;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

function toNum(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return isNaN(val) ? null : Math.round(val * 100) / 100;
  const parsed = parseFloat(String(val).replace(",", ".").replace(/[^\d.\-]/g, ""));
  return isNaN(parsed) ? null : Math.round(parsed * 100) / 100;
}

function toStr(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s.length > 0 ? s : null;
}

const VALID_VAT_RATES = new Set([0, 0.07, 0.19]);

function normaliseVatRate(val: unknown): number {
  const n = toNum(val);
  if (n === null) return 0.19;
  // Accept values like 19, 7, 0 (percentage) or 0.19, 0.07, 0.0 (decimal)
  const decimal = n > 1 ? n / 100 : n;
  const rounded = Math.round(decimal * 100) / 100;
  return VALID_VAT_RATES.has(rounded) ? rounded : 0.19;
}

// ---------------------------------------------------------------------------
// Category lookup helpers
// ---------------------------------------------------------------------------

function getCategoryId(db: ReturnType<typeof getDb>, name: string): number | null {
  const row = db
    .prepare("SELECT id FROM item_categories WHERE name = ?")
    .get(name) as { id: number } | undefined;
  return row?.id ?? null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extracts line items from a receipt image via the vision LLM, suggests
 * categories for each item in a second LLM call, cross-validates the sum
 * against the accounting record, and persists all rows to `receipt_items`.
 *
 * @param documentId  Matches `documents.id`
 * @param filePath    Absolute path to the original document file
 */
export async function extractAndSaveReceiptItems(
  documentId: number,
  filePath: string
): Promise<void> {
  const db = getDb();
  const logCtx = { documentId, filePath };

  logger.info(logCtx, "Receipt item extraction started");

  // --- Step 1: Convert document to base64 for vision LLM ---
  let imageBase64: string;
  try {
    imageBase64 = await documentToBase64(filePath);
  } catch (err) {
    logger.error({ ...logCtx, err }, "Failed to convert document to base64 — skipping receipt items");
    return;
  }

  // --- Step 2: Extract line items via vision LLM ---
  const client = getVisionOllamaClient();
  let rawItems: RawReceiptItem[] = [];
  let receiptTotal: number | null = null;

  try {
    const prompt = buildVisionReceiptItemExtractionPrompt();
    const response = await client.generateWithImage(prompt, imageBase64, {
      system: getAccountingSystemPrompt(),
      temperature: 0.05,
    });

    const parsed = parseJsonResponse<RawExtractionResult>(response);
    rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    receiptTotal = toNum(parsed.total);

    logger.info({ ...logCtx, itemCount: rawItems.length }, "Vision item extraction completed");
  } catch (err) {
    logger.error({ ...logCtx, err }, "Vision item extraction failed — no receipt items saved");
    return;
  }

  if (rawItems.length === 0) {
    logger.warn(logCtx, "Vision LLM returned zero items — skipping");
    return;
  }

  // --- Step 3: Normalise items ---
  const normalisedItems = rawItems
    .map((raw, idx) => {
      const description = toStr(raw.description);
      if (!description) return null;
      const totalPrice = toNum(raw.total_price);
      if (totalPrice === null) return null;

      return {
        position: idx,
        description,
        quantity: toNum(raw.quantity) ?? 1,
        unit: toStr(raw.unit),
        unit_price: toNum(raw.unit_price),
        total_price: totalPrice,
        vat_rate: normaliseVatRate(raw.vat_rate),
        vat_amount: null as number | null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (normalisedItems.length === 0) {
    logger.warn(logCtx, "All items failed normalisation — skipping");
    return;
  }

  // Compute vat_amount per item
  for (const item of normalisedItems) {
    item.vat_amount = Math.round(item.total_price * (item.vat_rate / (1 + item.vat_rate)) * 100) / 100;
  }

  // --- Step 4: Cross-validate item sum against accounting record ---
  const itemSum = normalisedItems.reduce((acc, i) => acc + i.total_price, 0);
  const roundedSum = Math.round(itemSum * 100) / 100;

  const acctRecord = db
    .prepare("SELECT brutto_betrag FROM accounting_records WHERE document_id = ?")
    .get(documentId) as { brutto_betrag: number | null } | undefined;

  const bruttoExpected = acctRecord?.brutto_betrag ?? receiptTotal;
  if (bruttoExpected !== null) {
    const diff = Math.abs(roundedSum - bruttoExpected);
    if (diff > 0.05) {
      logger.warn(
        { ...logCtx, itemSum: roundedSum, expected: bruttoExpected, diff },
        "Receipt item sum does not match brutto_betrag — flagging as issue"
      );
      // Insert a warning issue into accounting_field_issues if the record exists
      const acctRow = db
        .prepare("SELECT id FROM accounting_records WHERE document_id = ?")
        .get(documentId) as { id: number } | undefined;
      if (acctRow) {
        db.prepare(
          `INSERT INTO accounting_field_issues
             (accounting_record_id, issue_type, field_name, description, severity, resolved)
           VALUES (?, 'vat_mismatch', 'total_price', ?, 'warning', 0)`
        ).run(
          acctRow.id,
          `Receipt item sum (${roundedSum.toFixed(2)} EUR) differs from gross total (${bruttoExpected.toFixed(2)} EUR) by ${diff.toFixed(2)} EUR.`
        );
      }
    }
  }

  // --- Step 5: Batch category suggestion ---
  const categoryMap = new Map<number, { categoryId: number | null; confidence: number }>();

  try {
    const batchInput = normalisedItems.map((item, idx) => ({
      idx,
      description: item.description,
    }));

    const catPrompt = buildReceiptItemCategoryPrompt(batchInput);
    const catResponse = await client.generateWithImage(catPrompt, imageBase64, {
      system: getAccountingSystemPrompt(),
      temperature: 0.1,
    });

    const suggestions = parseJsonResponse<RawCategorySuggestion[]>(catResponse);

    for (const suggestion of suggestions) {
      if (typeof suggestion.idx !== "number") continue;
      const catId = getCategoryId(db, suggestion.category ?? "");
      const confidence = typeof suggestion.confidence === "number"
        ? Math.max(0, Math.min(1, suggestion.confidence))
        : 0.5;
      categoryMap.set(suggestion.idx, { categoryId: catId, confidence });
    }

    logger.info({ ...logCtx, suggested: categoryMap.size }, "Category suggestions completed");
  } catch (err) {
    logger.warn({ ...logCtx, err }, "Category suggestion failed — items saved without AI category");
  }

  // --- Step 6: Persist to DB in a single transaction ---
  const insert = db.prepare(
    `INSERT INTO receipt_items
       (document_id, position, description, quantity, unit, unit_price,
        total_price, vat_rate, vat_amount, ai_suggested_category_id, confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  db.transaction(() => {
    // Remove any existing items (idempotent re-run)
    db.prepare("DELETE FROM receipt_items WHERE document_id = ?").run(documentId);

    for (let idx = 0; idx < normalisedItems.length; idx++) {
      const item = normalisedItems[idx];
      const cat = categoryMap.get(idx);
      insert.run(
        documentId,
        item.position,
        item.description,
        item.quantity,
        item.unit,
        item.unit_price,
        item.total_price,
        item.vat_rate,
        item.vat_amount,
        cat?.categoryId ?? null,
        cat?.confidence ?? null
      );
    }
  })();

  logger.info({ ...logCtx, saved: normalisedItems.length }, "Receipt items saved");
}

// ---------------------------------------------------------------------------
// Query helpers used by routes
// ---------------------------------------------------------------------------

export function getReceiptItems(documentId: number): ReceiptItem[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT
         ri.*,
         ai_cat.id          AS ai_cat_id,
         ai_cat.name        AS ai_cat_name,
         ai_cat.description AS ai_cat_desc,
         ai_cat.skr03_konto AS ai_cat_skr03,
         ai_cat.skr03_konto_name AS ai_cat_skr03_name,
         conf_cat.id          AS conf_cat_id,
         conf_cat.name        AS conf_cat_name,
         conf_cat.description AS conf_cat_desc,
         conf_cat.skr03_konto AS conf_cat_skr03,
         conf_cat.skr03_konto_name AS conf_cat_skr03_name
       FROM receipt_items ri
       LEFT JOIN item_categories ai_cat   ON ai_cat.id   = ri.ai_suggested_category_id
       LEFT JOIN item_categories conf_cat ON conf_cat.id = ri.confirmed_category_id
       WHERE ri.document_id = ?
       ORDER BY ri.position`
    )
    .all(documentId)
    .map((row) => mapRow(row as Record<string, unknown>));
}

export function updateReceiptItemCategory(
  itemId: number,
  confirmedCategoryId: number | null
): ReceiptItem | null {
  const db = getDb();
  db.prepare(
    "UPDATE receipt_items SET confirmed_category_id = ? WHERE id = ?"
  ).run(confirmedCategoryId, itemId);
  return getReceiptItemById(itemId);
}

export function bulkUpdateCategory(
  documentId: number,
  itemIds: number[],
  confirmedCategoryId: number | null
): void {
  const db = getDb();
  const update = db.prepare(
    "UPDATE receipt_items SET confirmed_category_id = ? WHERE id = ? AND document_id = ?"
  );
  db.transaction(() => {
    for (const id of itemIds) {
      update.run(confirmedCategoryId, id, documentId);
    }
  })();
}

export function getAllItemCategories(): ItemCategory[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM item_categories ORDER BY is_system_category DESC, name")
    .all() as ItemCategory[];
}

export function createItemCategory(
  name: string,
  description: string | null,
  skr03Konto: string | null,
  skr03KontoName: string | null
): ItemCategory {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO item_categories (name, description, skr03_konto, skr03_konto_name, is_system_category)
       VALUES (?, ?, ?, ?, 0)`
    )
    .run(name, description, skr03Konto, skr03KontoName);
  return db
    .prepare("SELECT * FROM item_categories WHERE id = ?")
    .get(result.lastInsertRowid) as ItemCategory;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function getReceiptItemById(id: number): ReceiptItem | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
         ri.*,
         ai_cat.id          AS ai_cat_id,
         ai_cat.name        AS ai_cat_name,
         ai_cat.description AS ai_cat_desc,
         ai_cat.skr03_konto AS ai_cat_skr03,
         ai_cat.skr03_konto_name AS ai_cat_skr03_name,
         conf_cat.id          AS conf_cat_id,
         conf_cat.name        AS conf_cat_name,
         conf_cat.description AS conf_cat_desc,
         conf_cat.skr03_konto AS conf_cat_skr03,
         conf_cat.skr03_konto_name AS conf_cat_skr03_name
       FROM receipt_items ri
       LEFT JOIN item_categories ai_cat   ON ai_cat.id   = ri.ai_suggested_category_id
       LEFT JOIN item_categories conf_cat ON conf_cat.id = ri.confirmed_category_id
       WHERE ri.id = ?`
    )
    .get(id);
  return row ? mapRow(row as Record<string, unknown>) : null;
}

function mapRow(row: Record<string, unknown>): ReceiptItem {
  const makeCategory = (prefix: string): ItemCategory | undefined => {
    const id = row[`${prefix}_id`] as number | null;
    if (!id) return undefined;
    return {
      id,
      name: row[`${prefix}_name`] as string,
      description: (row[`${prefix}_desc`] as string | null) ?? null,
      skr03_konto: (row[`${prefix}_skr03`] as string | null) ?? null,
      skr03_konto_name: (row[`${prefix}_skr03_name`] as string | null) ?? null,
      parent_id: null,
      is_system_category: 1,
    };
  };

  return {
    id: row.id as number,
    document_id: row.document_id as number,
    position: row.position as number,
    description: row.description as string,
    quantity: row.quantity as number,
    unit: (row.unit as string | null) ?? null,
    unit_price: (row.unit_price as number | null) ?? null,
    total_price: row.total_price as number,
    vat_rate: row.vat_rate as number,
    vat_amount: (row.vat_amount as number | null) ?? null,
    ai_suggested_category_id: (row.ai_suggested_category_id as number | null) ?? null,
    confirmed_category_id: (row.confirmed_category_id as number | null) ?? null,
    confidence: (row.confidence as number | null) ?? null,
    created_at: row.created_at as string,
    ai_suggested_category: makeCategory("ai_cat"),
    confirmed_category: makeCategory("conf_cat"),
  };
}
