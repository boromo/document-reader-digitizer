import { useEffect, useRef, useState } from "react";
import { api } from "#/lib/api";
import type { Tag } from "#/types/models";
import { TagBadge } from "./tag-badge";

export function TagInput({
  value,
  onChange,
  placeholder = "Add tag...",
  disabled = false,
}: {
  value: Tag[];
  onChange: (tags: Tag[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.listTags().then(setAllTags).catch(() => {});
  }, []);

  useEffect(() => {
    if (input.trim()) {
      const lower = input.trim().toLowerCase();
      setSuggestions(
        allTags.filter(
          (t) =>
            t.name.toLowerCase().includes(lower) &&
            !value.some((v) => v.id === t.id)
        )
      );
    } else {
      setSuggestions([]);
    }
  }, [input, allTags, value]);

  const handleAdd = (tag: Tag) => {
    if (!value.some((t) => t.id === tag.id)) {
      onChange([...value, tag]);
    }
    setInput("");
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const handleCreate = async (name: string) => {
    try {
      const tag = await api.createTag(name);
      handleAdd(tag);
      setAllTags((prev) => [...prev, tag]);
    } catch {
      // ignore
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && input.trim()) {
      const existing = allTags.find(
        (t) => t.name.toLowerCase() === input.trim().toLowerCase()
      );
      if (existing) {
        handleAdd(existing);
      } else {
        handleCreate(input.trim());
      }
      e.preventDefault();
    } else if (e.key === "Backspace" && !input && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1 border rounded px-2 py-1 bg-white focus-within:ring-2 focus-within:ring-blue-400">
      {value.map((tag) => (
        <TagBadge
          key={tag.id}
          tag={tag}
          onRemove={disabled ? undefined : () => onChange(value.filter((t) => t.id !== tag.id))}
        />
      ))}
      <input
        ref={inputRef}
        type="text"
        className="flex-1 min-w-[80px] border-none outline-none py-1 text-sm bg-transparent"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 100)}
        onKeyDown={handleInputKeyDown}
        placeholder={placeholder}
        disabled={disabled}
      />
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute mt-10 bg-white border rounded shadow-lg z-10 max-h-40 overflow-auto w-56">
          {suggestions.map((tag) => (
            <div
              key={tag.id}
              className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm"
              onMouseDown={() => handleAdd(tag)}
            >
              {tag.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
