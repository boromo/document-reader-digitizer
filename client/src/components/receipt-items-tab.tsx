import { useEffect, useState } from "react";
import { RefreshCw, Tag } from "lucide-react";
import { api } from "#/lib/api";
import type { ReceiptItem } from "#/types/models";
import { ReceiptItemRow } from "./receipt-item-row";
import { VatSplitCard } from "./vat-split-card";
import { ItemCategorySelect } from "./item-category-select";

interface ReceiptItemsTabProps {
  documentId: number;
}

export function ReceiptItemsTab({ documentId }: ReceiptItemsTabProps) {
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bulk assign state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState<number | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api
      .getReceiptItems(documentId)
      .then((res) => setItems(res.items))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load items"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [documentId]);

  const handleItemUpdated = (updated: ReceiptItem) => {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  };

  const handleBulkAssign = async () => {
    if (selectedIds.size === 0) return;
    setBulkSaving(true);
    setBulkError(null);
    try {
      await api.bulkUpdateReceiptCategory(documentId, Array.from(selectedIds), bulkCategoryId);
      // Reload items after bulk update
      const res = await api.getReceiptItems(documentId);
      setItems(res.items);
      setSelectedIds(new Set());
      setBulkCategoryId(null);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Bulk update failed");
    } finally {
      setBulkSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-gray-400">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span>Loading items…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-400">
        No line items extracted for this receipt.
      </div>
    );
  }

  const uncategorizedCount = items.filter(
    (i) => i.confirmed_category_id === null && i.ai_suggested_category_id === null
  ).length;

  return (
    <div className="space-y-4">
      {/* VAT split summary */}
      <VatSplitCard items={items} />

      {/* Private items warning */}
      {items.some(
        (i) =>
          (i.confirmed_category_id ?? i.ai_suggested_category_id) !== null &&
          (i.confirmed_category?.name === "Private (non-deductible)" ||
            i.ai_suggested_category?.name === "Private (non-deductible)")
      ) && (
        <div className="rounded border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
          ⚠️ This receipt contains private (non-deductible) items. These cannot be claimed as business expenses.
        </div>
      )}

      {/* Bulk action bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <span className="text-sm font-medium text-gray-600 flex items-center gap-1">
          <Tag className="h-4 w-4" />
          Bulk assign:
        </span>
        <div className="w-56">
          <ItemCategorySelect
            value={bulkCategoryId}
            onChange={setBulkCategoryId}
            disabled={bulkSaving}
          />
        </div>
        <button
          onClick={handleBulkAssign}
          disabled={bulkSaving || selectedIds.size === 0}
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {bulkSaving
            ? "Saving…"
            : `Assign to ${selectedIds.size > 0 ? selectedIds.size : "selected"} item${selectedIds.size !== 1 ? "s" : ""}`}
        </button>
        {bulkError && <span className="text-sm text-red-500">{bulkError}</span>}
        {uncategorizedCount > 0 && (
          <span className="text-xs text-gray-400">
            {uncategorizedCount} item{uncategorizedCount !== 1 ? "s" : ""} uncategorized
          </span>
        )}
      </div>

      {/* Item table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={selectedIds.size === items.length && items.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded"
                />
              </th>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Unit Price</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-left">VAT</th>
              <th className="px-3 py-2 text-left">Category</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className={`border-b border-gray-100 text-sm ${item.total_price < 0 ? "bg-red-50" : ""}`}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    className="rounded"
                  />
                </td>
                <ReceiptItemRow
                  item={item}
                  onUpdated={handleItemUpdated}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
