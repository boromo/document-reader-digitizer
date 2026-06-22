import { Router } from "express";
import { getDb } from "../db/database.js";
import {
  getReceiptItems,
  updateReceiptItemCategory,
  bulkUpdateCategory,
  getAllItemCategories,
  createItemCategory,
} from "../services/receipt-item-service.js";
import { logger } from "../logger.js";

export const receiptItemsRouter = Router();

// ---------------------------------------------------------------------------
// GET /api/documents/:id/receipt-items
// List all receipt items for a document (with joined category data)
// ---------------------------------------------------------------------------
receiptItemsRouter.get("/documents/:id/receipt-items", (req, res) => {
  const documentId = parseInt(req.params.id, 10);
  if (isNaN(documentId)) {
    res.status(400).json({ error: "Invalid document ID" });
    return;
  }

  try {
    const items = getReceiptItems(documentId);
    res.json({ items, total: items.length });
  } catch (err) {
    logger.error({ documentId, err }, "Failed to list receipt items");
    res.status(500).json({ error: "Failed to retrieve receipt items" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/receipt-items/:id
// Confirm or change the category for a single line item
// ---------------------------------------------------------------------------
receiptItemsRouter.patch("/receipt-items/:id", (req, res) => {
  const itemId = parseInt(req.params.id, 10);
  if (isNaN(itemId)) {
    res.status(400).json({ error: "Invalid item ID" });
    return;
  }

  const { confirmed_category_id } = req.body as { confirmed_category_id: unknown };

  // Allow null (clear the confirmed category) or a positive integer
  if (confirmed_category_id !== null && confirmed_category_id !== undefined) {
    const catId = Number(confirmed_category_id);
    if (!Number.isInteger(catId) || catId < 1) {
      res.status(400).json({ error: "confirmed_category_id must be a positive integer or null" });
      return;
    }
    // Verify the category exists
    const db = getDb();
    const cat = db.prepare("SELECT id FROM item_categories WHERE id = ?").get(catId);
    if (!cat) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
  }

  try {
    const updated = updateReceiptItemCategory(
      itemId,
      confirmed_category_id !== undefined && confirmed_category_id !== null
        ? Number(confirmed_category_id)
        : null
    );
    if (!updated) {
      res.status(404).json({ error: "Receipt item not found" });
      return;
    }
    res.json({ message: "Category updated", item: updated });
  } catch (err) {
    logger.error({ itemId, err }, "Failed to update receipt item category");
    res.status(500).json({ error: "Failed to update category" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/documents/:id/receipt-items/bulk-category
// Assign the same category to multiple items at once
// ---------------------------------------------------------------------------
receiptItemsRouter.patch("/documents/:id/receipt-items/bulk-category", (req, res) => {
  const documentId = parseInt(req.params.id, 10);
  if (isNaN(documentId)) {
    res.status(400).json({ error: "Invalid document ID" });
    return;
  }

  const { item_ids, confirmed_category_id } = req.body as {
    item_ids: unknown;
    confirmed_category_id: unknown;
  };

  if (!Array.isArray(item_ids) || item_ids.length === 0) {
    res.status(400).json({ error: "item_ids must be a non-empty array" });
    return;
  }

  const validIds = item_ids.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (validIds.length === 0) {
    res.status(400).json({ error: "No valid item IDs provided" });
    return;
  }

  const catId =
    confirmed_category_id !== null && confirmed_category_id !== undefined
      ? Number(confirmed_category_id)
      : null;

  if (catId !== null) {
    if (!Number.isInteger(catId) || catId < 1) {
      res.status(400).json({ error: "confirmed_category_id must be a positive integer or null" });
      return;
    }
    const db = getDb();
    const cat = db.prepare("SELECT id FROM item_categories WHERE id = ?").get(catId);
    if (!cat) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
  }

  try {
    bulkUpdateCategory(documentId, validIds, catId);
    res.json({ message: "Categories updated", updated: validIds.length });
  } catch (err) {
    logger.error({ documentId, err }, "Bulk category update failed");
    res.status(500).json({ error: "Failed to update categories" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/item-categories
// List all item categories (system + custom), ordered by system first then name
// ---------------------------------------------------------------------------
receiptItemsRouter.get("/item-categories", (_req, res) => {
  try {
    const categories = getAllItemCategories();
    res.json({ categories });
  } catch (err) {
    logger.error({ err }, "Failed to list item categories");
    res.status(500).json({ error: "Failed to retrieve categories" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/item-categories
// Create a custom item category
// ---------------------------------------------------------------------------
receiptItemsRouter.post("/item-categories", (req, res) => {
  const { name, description, skr03_konto, skr03_konto_name } = req.body as {
    name: unknown;
    description?: unknown;
    skr03_konto?: unknown;
    skr03_konto_name?: unknown;
  };

  if (typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const trimmedName = name.trim();
  if (trimmedName.length > 100) {
    res.status(400).json({ error: "name must be 100 characters or fewer" });
    return;
  }

  try {
    const category = createItemCategory(
      trimmedName,
      typeof description === "string" ? description.trim() || null : null,
      typeof skr03_konto === "string" ? skr03_konto.trim() || null : null,
      typeof skr03_konto_name === "string" ? skr03_konto_name.trim() || null : null
    );
    res.status(201).json({ message: "Category created", category });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("UNIQUE constraint")) {
      res.status(409).json({ error: "A category with that name already exists" });
      return;
    }
    logger.error({ err }, "Failed to create item category");
    res.status(500).json({ error: "Failed to create category" });
  }
});
