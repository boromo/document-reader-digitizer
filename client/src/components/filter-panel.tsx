import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { api } from "#/lib/api";
import type { DocumentFilters, Tag, DocumentType } from "#/types/models";
import { TagBadge } from "#/components/tag-badge";

const STATUSES = [
  { label: "Pending", value: "pending" },
  { label: "Processing", value: "processing" },
  { label: "Review", value: "review" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Rejected", value: "rejected" },
];

const SIZE_UNITS = [
  { label: "KB", factor: 1024 },
  { label: "MB", factor: 1024 * 1024 },
];

interface FilterPanelProps {
  filters: DocumentFilters;
  onChange: (update: Partial<DocumentFilters>) => void;
  onClose: () => void;
}

export function FilterPanel({ filters, onChange, onClose }: FilterPanelProps) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [allTypes, setAllTypes] = useState<DocumentType[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [sizeUnit, setSizeUnit] = useState<"KB" | "MB">("KB");

  useEffect(() => {
    api.listTags().then(setAllTags).catch(() => {});
    api.getDocumentTypes().then(setAllTypes).catch(() => {});
  }, []);

  const selectedTags = allTags.filter((t) => filters.tagIds.includes(t.id));
  const filteredTagSuggestions = allTags.filter(
    (t) =>
      !filters.tagIds.includes(t.id) &&
      t.name.toLowerCase().includes(tagInput.toLowerCase())
  );

  function toggleStatus(value: string) {
    const next = filters.statuses.includes(value)
      ? filters.statuses.filter((s) => s !== value)
      : [...filters.statuses, value];
    onChange({ statuses: next });
  }

  function toggleType(value: string) {
    const next = filters.types.includes(value)
      ? filters.types.filter((t) => t !== value)
      : [...filters.types, value];
    onChange({ types: next });
  }

  function addTag(tag: Tag) {
    if (!filters.tagIds.includes(tag.id)) {
      onChange({ tagIds: [...filters.tagIds, tag.id] });
    }
    setTagInput("");
  }

  function removeTag(tagId: number) {
    onChange({ tagIds: filters.tagIds.filter((id) => id !== tagId) });
  }

  function bytesToUnit(bytes: number | null, unit: "KB" | "MB"): string {
    if (bytes == null) return "";
    const factor = unit === "MB" ? 1024 * 1024 : 1024;
    return String(Math.round(bytes / factor));
  }

  function unitToBytes(value: string, unit: "KB" | "MB"): number | null {
    const n = parseFloat(value);
    if (isNaN(n) || n < 0) return null;
    const factor = unit === "MB" ? 1024 * 1024 : 1024;
    return Math.round(n * factor);
  }

  return (
    <div className="w-72 bg-white border-l border-gray-200 flex flex-col h-full shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-sm text-gray-800">Filters</h2>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 text-gray-500"
          aria-label="Close filters"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 text-sm">
        {/* Status */}
        <section>
          <h3 className="font-medium text-gray-700 mb-2">Status</h3>
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => {
              const active = filters.statuses.includes(s.value);
              return (
                <button
                  key={s.value}
                  onClick={() => toggleStatus(s.value)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    active
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-600 border-gray-300 hover:border-gray-500"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Tags */}
        <section>
          <h3 className="font-medium text-gray-700 mb-2">Tags</h3>
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {selectedTags.map((tag) => (
                <TagBadge key={tag.id} tag={tag} onRemove={() => removeTag(tag.id)} />
              ))}
            </div>
          )}
          <div className="relative">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="Search tags..."
              className="w-full px-3 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            {tagInput && filteredTagSuggestions.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-md max-h-40 overflow-y-auto">
                {filteredTagSuggestions.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => addTag(tag)}
                    className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-sm"
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Document Type */}
        {allTypes.length > 0 && (
          <section>
            <h3 className="font-medium text-gray-700 mb-2">Document Type</h3>
            <div className="space-y-1">
              {allTypes.map((t) => {
                const active = filters.types.includes(t.name);
                return (
                  <label key={t.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => toggleType(t.name)}
                      className="rounded border-gray-300 accent-gray-900"
                    />
                    <span className="text-gray-700">{t.name}</span>
                  </label>
                );
              })}
            </div>
          </section>
        )}

        {/* Upload Date */}
        <section>
          <h3 className="font-medium text-gray-700 mb-2">Upload Date</h3>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">From</label>
              <input
                type="date"
                value={filters.from ?? ""}
                onChange={(e) => onChange({ from: e.target.value || null })}
                className="w-full px-3 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">To</label>
              <input
                type="date"
                value={filters.to ?? ""}
                onChange={(e) => onChange({ to: e.target.value || null })}
                className="w-full px-3 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>
        </section>

        {/* File Size */}
        <section>
          <h3 className="font-medium text-gray-700 mb-2">File Size</h3>
          <div className="flex gap-1 mb-2">
            {SIZE_UNITS.map((u) => (
              <button
                key={u.label}
                onClick={() => setSizeUnit(u.label as "KB" | "MB")}
                className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                  sizeUnit === u.label
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 border-gray-300"
                }`}
              >
                {u.label}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Min ({sizeUnit})</label>
              <input
                type="number"
                min="0"
                value={bytesToUnit(filters.minSize, sizeUnit)}
                onChange={(e) =>
                  onChange({ minSize: unitToBytes(e.target.value, sizeUnit) })
                }
                placeholder="0"
                className="w-full px-3 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Max ({sizeUnit})</label>
              <input
                type="number"
                min="0"
                value={bytesToUnit(filters.maxSize, sizeUnit)}
                onChange={(e) =>
                  onChange({ maxSize: unitToBytes(e.target.value, sizeUnit) })
                }
                placeholder="No limit"
                className="w-full px-3 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>
        </section>

        {/* Sort */}
        <section>
          <h3 className="font-medium text-gray-700 mb-2">Sort</h3>
          <div className="space-y-2">
            <select
              value={filters.sort}
              onChange={(e) =>
                onChange({ sort: e.target.value as DocumentFilters["sort"] })
              }
              className="w-full px-3 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="upload_date">Upload Date</option>
              <option value="original_filename">Filename</option>
              <option value="file_size_bytes">File Size</option>
              <option value="status">Status</option>
            </select>
            <div className="flex gap-1">
              {(["desc", "asc"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => onChange({ dir: d })}
                  className={`flex-1 py-1 rounded text-xs font-medium border transition-colors ${
                    filters.dir === d
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-600 border-gray-300"
                  }`}
                >
                  {d === "desc" ? "Newest first" : "Oldest first"}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
