import React, { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { FileText, ChevronLeft, ChevronRight, Search, SlidersHorizontal } from "lucide-react";
import { api } from "#/lib/api";
import { StatusBadge } from "#/components/status-badge";
import { TagBadge } from "#/components/tag-badge";
import { FilterPanel } from "#/components/filter-panel";
import { ActiveFiltersBar } from "#/components/active-filters-bar";
import { useDocumentFilters } from "#/hooks/useDocumentFilters";
import type { DocumentListResult, Tag, DocumentType } from "#/types/models";

function renderEmptyStateAction(): React.ReactNode {
  return null;
}

export function DocumentsPage() {
  const { filters, page, setFilters, setPage, clearFilters, activeCount } =
    useDocumentFilters();

  const [data, setData] = useState<DocumentListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(filters.search);

  // Cache tags/types for the active filters bar (loaded once)
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [allTypes, setAllTypes] = useState<DocumentType[]>([]);

  // Keep searchInput in sync with URL if it changes externally (e.g. ActiveFiltersBar clear)
  const prevSearch = useRef(filters.search);
  useEffect(() => {
    if (filters.search !== prevSearch.current) {
      setSearchInput(filters.search);
      prevSearch.current = filters.search;
    }
  }, [filters.search]);

  // Load reference data once
  useEffect(() => {
    api.listTags().then(setAllTags).catch(() => {});
    api.getDocumentTypes().then(setAllTypes).catch(() => {});
  }, []);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.listDocuments({ ...filters, page, limit: 20 });
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters({ search: searchInput });
  };

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isLoading = loading;
  const isEmpty = !data || data.documents.length === 0;

  function renderContent() {
    if (isLoading) {
      return <div className="text-center py-12 text-gray-500">Loading...</div>;
    }
    if (isEmpty) {
      return (
        <div className="text-center py-12">
          <FileText className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <p className="text-gray-500">No documents found</p>
          {renderEmptyStateAction()}
        </div>
      );
    }
    return (
      <>
        <div className="border rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Document
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Size
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Uploaded
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tags
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.documents.map((doc) => {
                const type =
                  doc.classification?.confirmed_type ??
                  doc.classification?.ai_suggested_type;
                const thumbnail = doc.thumbnail_path ? (
                  <img
                    src={api.getThumbnailUrl(doc.id)}
                    alt=""
                    className="w-10 h-12 object-cover rounded border"
                  />
                ) : (
                  <div className="w-10 h-12 bg-gray-100 rounded border flex items-center justify-center">
                    <FileText className="h-5 w-5 text-gray-400" />
                  </div>
                );
                const typeDisplay = type ? (
                  <span className="capitalize">{type}</span>
                ) : (
                  <span className="text-gray-300">—</span>
                );
                return (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link
                        to={`/documents/${doc.id}`}
                        className="flex items-center gap-3 group"
                      >
                        {thumbnail}
                        <span className="text-sm font-medium text-gray-900 group-hover:text-blue-600 truncate max-w-xs">
                          {doc.original_filename}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatSize(doc.file_size_bytes)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={doc.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {typeDisplay}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatDate(doc.upload_date)}
                    </td>
                    <td className="px-4 py-3">
                      {doc.tags && doc.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {doc.tags.map((tag) => (
                            <TagBadge key={tag.id} tag={tag} />
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-gray-500">
              Showing {(page - 1) * data.limit + 1}–
              {Math.min(page * data.limit, data.total)} of {data.total}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
                className="p-2 rounded-md border disabled:opacity-50 hover:bg-gray-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages}
                className="p-2 rounded-md border disabled:opacity-50 hover:bg-gray-50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="flex h-full relative">
      {/* Main content */}
      <div className="flex-1 min-w-0 p-6">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Documents</h1>
          <Link
            to="/upload"
            className="inline-flex items-center px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm font-medium"
          >
            Upload
          </Link>
        </div>

        {/* Toolbar: search + filter toggle */}
        <div className="flex gap-3 mb-2">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search extracted text..."
                className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium"
            >
              Search
            </button>
          </form>

          {/* Filter toggle */}
          <button
            type="button"
            onClick={() => setFilterPanelOpen((o) => !o)}
            className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
              filterPanelOpen || activeCount > 0
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {activeCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center font-bold">
                {activeCount}
              </span>
            )}
          </button>
        </div>

        {/* Active filters bar */}
        <ActiveFiltersBar
          filters={filters}
          allTags={allTags}
          allTypes={allTypes}
          onChange={setFilters}
          onClear={clearFilters}
        />

        {/* Result count */}
        {data && !loading && (
          <p className="text-xs text-gray-500 mb-3">
            {data.total} document{data.total === 1 ? "" : "s"} found
          </p>
        )}

        {/* Table */}
        {renderContent()}
      </div>

      {/* Filter panel (fixed right sidebar, below nav) */}
      {filterPanelOpen && (
        <div className="fixed inset-y-0 right-0 z-40 flex" style={{ top: "57px" }}>
          <FilterPanel
            filters={filters}
            onChange={setFilters}
            onClose={() => setFilterPanelOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
