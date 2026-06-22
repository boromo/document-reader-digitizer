import { X } from "lucide-react";
import type { DocumentFilters, Tag, DocumentType } from "#/types/models";

interface ActiveFiltersBarProps {
  filters: DocumentFilters;
  allTags: Tag[];
  allTypes: DocumentType[]; // reserved for future type-label lookup
  onChange: (update: Partial<DocumentFilters>) => void;
  onClear: () => void;
}

function Chip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
      {label}
      <button
        onClick={onRemove}
        className="ml-0.5 rounded-full p-0.5 hover:bg-blue-100 text-blue-500"
        aria-label={`Remove filter ${label}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ActiveFiltersBar({
  filters,
  allTags,
  onChange,
  onClear,
}: ActiveFiltersBarProps) {
  const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];

  // Statuses
  for (const s of filters.statuses) {
    chips.push({
      key: `status:${s}`,
      label: `Status: ${s}`,
      onRemove: () =>
        onChange({ statuses: filters.statuses.filter((x) => x !== s) }),
    });
  }

  // Tags
  for (const id of filters.tagIds) {
    const tag = allTags.find((t) => t.id === id);
    chips.push({
      key: `tag:${id}`,
      label: `Tag: ${tag?.name ?? id}`,
      onRemove: () =>
        onChange({ tagIds: filters.tagIds.filter((x) => x !== id) }),
    });
  }

  // Types
  for (const typeName of filters.types) {
    chips.push({
      key: `type:${typeName}`,
      label: `Type: ${typeName}`,
      onRemove: () =>
        onChange({ types: filters.types.filter((x) => x !== typeName) }),
    });
  }

  // Date range
  if (filters.from) {
    chips.push({
      key: "from",
      label: `From: ${filters.from}`,
      onRemove: () => onChange({ from: null }),
    });
  }
  if (filters.to) {
    chips.push({
      key: "to",
      label: `To: ${filters.to}`,
      onRemove: () => onChange({ to: null }),
    });
  }

  // Size range
  if (filters.minSize != null) {
    chips.push({
      key: "minSize",
      label: `Min size: ${formatBytes(filters.minSize)}`,
      onRemove: () => onChange({ minSize: null }),
    });
  }
  if (filters.maxSize != null) {
    chips.push({
      key: "maxSize",
      label: `Max size: ${formatBytes(filters.maxSize)}`,
      onRemove: () => onChange({ maxSize: null }),
    });
  }

  // Search
  if (filters.search) {
    chips.push({
      key: "search",
      label: `Search: "${filters.search}"`,
      onRemove: () => onChange({ search: "" }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 py-2 px-1">
      {chips.map((chip) => (
        <Chip key={chip.key} label={chip.label} onRemove={chip.onRemove} />
      ))}
      <button
        onClick={onClear}
        className="text-xs text-gray-500 hover:text-gray-800 underline ml-1"
      >
        Clear all
      </button>
    </div>
  );
}
