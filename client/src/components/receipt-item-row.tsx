import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { api } from "#/lib/api";
import type { ReceiptItem } from "#/types/models";
import { ItemCategorySelect } from "./item-category-select";

interface ReceiptItemRowProps {
  item: ReceiptItem;
  onUpdated: (updated: ReceiptItem) => void;
}

function vatBadge(rate: number) {
  const label = rate === 0 ? "0%" : rate === 0.07 ? "7%" : "19%";
  const cls =
    rate === 0.19
      ? "bg-orange-100 text-orange-700"
      : rate === 0.07
      ? "bg-blue-100 text-blue-700"
      : "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function formatEur(n: number | null): string {
  if (n === null) return "—";
  return `€${Math.abs(n).toFixed(2)}`;
}

/**
 * Renders the data cells for a receipt line item row.
 * The parent (<ReceiptItemsTab>) wraps this in a <tr> with a checkbox cell.
 */
export function ReceiptItemRow({ item, onUpdated }: ReceiptItemRowProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentCategoryId = item.confirmed_category_id ?? item.ai_suggested_category_id ?? null;

  const handleCategoryChange = async (categoryId: number | null) => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.updateReceiptItemCategory(item.id, categoryId);
      onUpdated(res.item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const isReturn = item.total_price < 0;
  const isAiCategory = item.confirmed_category_id === null && item.ai_suggested_category_id !== null;
  const lowConfidence = item.confidence !== null && item.confidence < 0.7 && isAiCategory;

  return (
    <>
      <td className="px-3 py-2 text-gray-500">{item.position + 1}</td>
      <td className="px-3 py-2">
        <span className={isReturn ? "italic text-red-600" : ""}>{item.description}</span>
        {isReturn && (
          <span className="ml-2 text-xs text-red-500">Return / Discount</span>
        )}
      </td>
      <td className="px-3 py-2 text-right text-gray-600">
        {item.quantity !== 1 || item.unit
          ? `${item.quantity}${item.unit ? ` ${item.unit}` : ""}`
          : "1"}
      </td>
      <td className="px-3 py-2 text-right text-gray-600">
        {formatEur(item.unit_price)}
      </td>
      <td className={`px-3 py-2 text-right font-medium ${isReturn ? "text-red-600" : ""}`}>
        {isReturn ? `-${formatEur(item.total_price)}` : formatEur(item.total_price)}
      </td>
      <td className="px-3 py-2">{vatBadge(item.vat_rate)}</td>
      <td className="px-3 py-2 min-w-[200px]">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <ItemCategorySelect
              value={currentCategoryId}
              onChange={handleCategoryChange}
              disabled={saving}
            />
            {isAiCategory && !lowConfidence && (
              <span className="text-xs text-blue-500 whitespace-nowrap">AI</span>
            )}
          </div>
          {lowConfidence && (
            <span className="flex items-center gap-1 text-xs text-amber-600">
              <AlertCircle className="h-3 w-3" />
              Low confidence ({Math.round((item.confidence ?? 0) * 100)}%)
            </span>
          )}
          {error && <span className="text-xs text-red-500">{error}</span>}
        </div>
      </td>
    </>
  );
}
