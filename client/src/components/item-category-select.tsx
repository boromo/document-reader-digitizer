import { useEffect, useState } from "react";
import { api } from "#/lib/api";
import type { ItemCategory } from "#/types/models";

interface ItemCategorySelectProps {
  value: number | null;
  onChange: (categoryId: number | null) => void;
  disabled?: boolean;
}

export function ItemCategorySelect({ value, onChange, disabled }: ItemCategorySelectProps) {
  const [categories, setCategories] = useState<ItemCategory[]>([]);

  useEffect(() => {
    api
      .getItemCategories()
      .then((res) => setCategories(res.categories))
      .catch(() => {/* non-critical */});
  }, []);

  return (
    <select
      className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => {
        const val = e.target.value;
        onChange(val === "" ? null : parseInt(val, 10));
      }}
    >
      <option value="">— Uncategorized —</option>
      {categories.map((cat) => (
        <option key={cat.id} value={cat.id}>
          {cat.name}
          {cat.skr03_konto ? ` (${cat.skr03_konto})` : ""}
        </option>
      ))}
    </select>
  );
}
