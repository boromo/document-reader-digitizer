import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { DocumentFilters, SortField, SortDir } from "#/types/models";

const DEFAULT_FILTERS: DocumentFilters = {
  statuses: [],
  tagIds: [],
  types: [],
  from: null,
  to: null,
  minSize: null,
  maxSize: null,
  search: "",
  sort: "upload_date",
  dir: "desc",
};

function parseIntList(value: string | null): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => parseInt(v, 10))
    .filter((n) => !isNaN(n));
}

function parseStringList(value: string | null): string[] {
  if (!value) return [];
  return value.split(",").filter(Boolean);
}

export function useDocumentFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Memoize so the object reference only changes when the URL actually changes,
  // preventing infinite re-render loops in components that depend on `filters`.
  const filters: DocumentFilters = useMemo(() => ({
    statuses: parseStringList(searchParams.get("status")),
    tagIds: parseIntList(searchParams.get("tags")),
    types: parseStringList(searchParams.get("type")),
    from: searchParams.get("from"),
    to: searchParams.get("to"),
    minSize: searchParams.get("minSize") !== null ? parseInt(searchParams.get("minSize")!, 10) : null,
    maxSize: searchParams.get("maxSize") !== null ? parseInt(searchParams.get("maxSize")!, 10) : null,
    search: searchParams.get("search") ?? "",
    sort: (searchParams.get("sort") as SortField) ?? "upload_date",
    dir: (searchParams.get("dir") as SortDir) ?? "desc",
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [searchParams.toString()]);

  const page = parseInt(searchParams.get("page") ?? "1", 10);

  const setFilters = useCallback(
    (update: Partial<DocumentFilters>) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        // Merge update on top of current parsed filters
        const current: DocumentFilters = {
          statuses: parseStringList(prev.get("status")),
          tagIds: parseIntList(prev.get("tags")),
          types: parseStringList(prev.get("type")),
          from: prev.get("from"),
          to: prev.get("to"),
          minSize: prev.get("minSize") !== null ? parseInt(prev.get("minSize")!, 10) : null,
          maxSize: prev.get("maxSize") !== null ? parseInt(prev.get("maxSize")!, 10) : null,
          search: prev.get("search") ?? "",
          sort: (prev.get("sort") as SortField) ?? "upload_date",
          dir: (prev.get("dir") as SortDir) ?? "desc",
        };
        const merged = { ...current, ...update };

        // Reset page when filters change
        next.delete("page");

        if (merged.statuses.length > 0) {
          next.set("status", merged.statuses.join(","));
        } else {
          next.delete("status");
        }
        if (merged.tagIds.length > 0) {
          next.set("tags", merged.tagIds.join(","));
        } else {
          next.delete("tags");
        }
        if (merged.types.length > 0) {
          next.set("type", merged.types.join(","));
        } else {
          next.delete("type");
        }
        if (merged.from) {
          next.set("from", merged.from);
        } else {
          next.delete("from");
        }
        if (merged.to) {
          next.set("to", merged.to);
        } else {
          next.delete("to");
        }
        if (merged.minSize != null) {
          next.set("minSize", String(merged.minSize));
        } else {
          next.delete("minSize");
        }
        if (merged.maxSize != null) {
          next.set("maxSize", String(merged.maxSize));
        } else {
          next.delete("maxSize");
        }
        if (merged.search) {
          next.set("search", merged.search);
        } else {
          next.delete("search");
        }
        if (merged.sort && merged.sort !== "upload_date") {
          next.set("sort", merged.sort);
        } else {
          next.delete("sort");
        }
        if (merged.dir && merged.dir !== "desc") {
          next.set("dir", merged.dir);
        } else {
          next.delete("dir");
        }

        return next;
      });
    },
    [setSearchParams]
  );

  const setPage = useCallback(
    (p: number) => {
      const next = new URLSearchParams(searchParams);
      if (p > 1) {
        next.set("page", String(p));
      } else {
        next.delete("page");
      }
      setSearchParams(next);
    },
    [searchParams, setSearchParams]
  );

  const clearFilters = useCallback(() => {
    const next = new URLSearchParams();
    setSearchParams(next);
  }, [setSearchParams]);

  const activeCount =
    filters.statuses.length +
    filters.tagIds.length +
    filters.types.length +
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0) +
    (filters.minSize != null ? 1 : 0) +
    (filters.maxSize != null ? 1 : 0) +
    (filters.search ? 1 : 0);

  return {
    filters,
    page,
    setFilters,
    setPage,
    clearFilters,
    activeCount,
    defaultFilters: DEFAULT_FILTERS,
  };
}
