import type {
  DocumentWithDetails,
  DocumentListResult,
  UploadResult,
  QueueStats,
  DocumentType,
  DashboardSummary,
  Tag,
  DocumentFilters,
  AccountingRecordDetail,
  AccountingListResult,
  AccountingSummary,
  BankTransactionListResult,
  ReceiptItemsResult,
  ItemCategoriesResult,
  ItemCategory,
  ReceiptItem,
} from "#/types/models";

const BASE = "/api";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  // Documents
  listDocuments(filters?: Partial<DocumentFilters> & { page?: number; limit?: number }): Promise<DocumentListResult> {
    const qs = new URLSearchParams();
    if (filters?.statuses?.length) qs.set("status", filters.statuses.join(","));
    if (filters?.tagIds?.length) qs.set("tags", filters.tagIds.join(","));
    if (filters?.types?.length) qs.set("type", filters.types.join(","));
    if (filters?.from) qs.set("from", filters.from);
    if (filters?.to) qs.set("to", filters.to);
    if (filters?.minSize != null) qs.set("minSize", String(filters.minSize));
    if (filters?.maxSize != null) qs.set("maxSize", String(filters.maxSize));
    if (filters?.search) qs.set("search", filters.search);
    if (filters?.sort) qs.set("sort", filters.sort);
    if (filters?.dir) qs.set("dir", filters.dir);
    if (filters?.page) qs.set("page", String(filters.page));
    if (filters?.limit) qs.set("limit", String(filters.limit));
    const query = qs.toString();
    return request(`/documents${query ? `?${query}` : ""}`);
  },

  getDocument(id: number): Promise<DocumentWithDetails> {
    return request(`/documents/${id}`);
  },

  uploadFiles(files: File[]): Promise<UploadResult> {
    const formData = new FormData();
    for (const file of files) {
      formData.append("files", file);
    }
    return fetch(`${BASE}/documents/upload`, {
      method: "POST",
      body: formData,
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || `Upload failed: ${res.status}`);
      }
      return res.json();
    });
  },

  deleteDocument(id: number): Promise<void> {
    return request(`/documents/${id}`, { method: "DELETE" });
  },

  confirmDocument(id: number): Promise<{ message: string; id: number }> {
    return request(`/documents/${id}/confirm`, { method: "PATCH" });
  },

  classifyDocument(
    id: number,
    type: string
  ): Promise<{ message: string; id: number; type: string }> {
    return request(`/documents/${id}/classify`, {
      method: "PATCH",
      body: JSON.stringify({ type }),
    });
  },

  updateFields(
    id: number,
    fields: Array<{ id: number; confirmed_value: string }>
  ): Promise<{ message: string; id: number; count: number }> {
    return request(`/documents/${id}/fields`, {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    });
  },

  // Jobs
  getQueueStats(): Promise<QueueStats> {
    return request("/jobs/stats");
  },

  // Types
  getDocumentTypes(): Promise<DocumentType[]> {
    return request("/types");
  },

  // URLs
  getOriginalUrl(id: number): string {
    return `${BASE}/documents/${id}/original`;
  },

  getThumbnailUrl(id: number): string {
    return `${BASE}/documents/${id}/thumbnail`;
  },

  // Reports
  getDashboardSummary(): Promise<DashboardSummary> {
    return request("/reports/summary");
  },

  getExportUrl(format: "csv" | "json"): string {
    return `${BASE}/reports/export?format=${format}`;
  },

  // Tags
  listTags(): Promise<Tag[]> {
    return request("/tags");
  },

  createTag(name: string): Promise<Tag> {
    return request("/tags", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },

  setDocumentTags(documentId: number, tagIds: number[]): Promise<void> {
    return request(`/documents/${documentId}/tags`, {
      method: "POST",
      body: JSON.stringify({ tagIds }),
    });
  },

  addTagToDocument(documentId: number, tagId: number): Promise<void> {
    return request(`/documents/${documentId}/tags/${tagId}`, { method: "POST" });
  },

  removeTagFromDocument(documentId: number, tagId: number): Promise<void> {
    return request(`/documents/${documentId}/tags/${tagId}`, { method: "DELETE" });
  },

  // Accounting Agent
  listAccountingRecords(params?: {
    belegart?: string;
    status?: string;
    from?: string;
    to?: string;
    missing_fields?: boolean;
    page?: number;
    limit?: number;
  }): Promise<AccountingListResult> {
    const qs = new URLSearchParams();
    if (params?.belegart) qs.set("belegart", params.belegart);
    if (params?.status) qs.set("status", params.status);
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.missing_fields) qs.set("missing_fields", "true");
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    const query = qs.toString();
    return request(`/accounting${query ? `?${query}` : ""}`);
  },

  getAccountingRecord(documentId: number): Promise<AccountingRecordDetail> {
    return request(`/accounting/${documentId}`);
  },

  confirmAccountingRecord(documentId: number): Promise<{ message: string; documentId: number }> {
    return request(`/accounting/${documentId}/confirm`, { method: "PATCH" });
  },

  updateAccountingFields(
    documentId: number,
    fields: Record<string, unknown>
  ): Promise<{ message: string; documentId: number }> {
    return request(`/accounting/${documentId}/fields`, {
      method: "PATCH",
      body: JSON.stringify(fields),
    });
  },

  reprocessAccountingRecord(documentId: number): Promise<{ message: string; documentId: number }> {
    return request(`/accounting/${documentId}/reprocess`, { method: "POST" });
  },

  getAccountingSummary(params?: { from?: string; to?: string }): Promise<AccountingSummary> {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    const query = qs.toString();
    return request(`/accounting/summary${query ? `?${query}` : ""}`);
  },

  getVatReport(params?: { from?: string; to?: string }): Promise<{
    period: { from: string | null; to: string | null };
    rows: unknown[];
  }> {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    const query = qs.toString();
    return request(`/accounting/vat-report${query ? `?${query}` : ""}`);
  },

  getOpenItems(): Promise<{ items: unknown[]; total: number }> {
    return request("/accounting/open-items");
  },

  getAccountingExportUrl(format: "csv" | "datev", params?: { from?: string; to?: string }): string {
    const qs = new URLSearchParams({ format });
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    return `${BASE}/accounting/export?${qs.toString()}`;
  },

  listBankTransactions(params?: {
    status?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }): Promise<BankTransactionListResult> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    const query = qs.toString();
    return request(`/bank-transactions${query ? `?${query}` : ""}`);
  },

  matchBankTransaction(
    id: number,
    matched_invoice_id: number | null,
    booking_category?: string
  ): Promise<{ message: string; id: number; status: string }> {
    return request(`/bank-transactions/${id}/match`, {
      method: "PATCH",
      body: JSON.stringify({ matched_invoice_id, booking_category }),
    });
  },

  // Receipt items
  getReceiptItems(documentId: number): Promise<ReceiptItemsResult> {
    return request(`/documents/${documentId}/receipt-items`);
  },

  updateReceiptItemCategory(
    itemId: number,
    confirmedCategoryId: number | null
  ): Promise<{ message: string; item: ReceiptItem }> {
    return request(`/receipt-items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify({ confirmed_category_id: confirmedCategoryId }),
    });
  },

  bulkUpdateReceiptCategory(
    documentId: number,
    itemIds: number[],
    confirmedCategoryId: number | null
  ): Promise<{ message: string; updated: number }> {
    return request(`/documents/${documentId}/receipt-items/bulk-category`, {
      method: "PATCH",
      body: JSON.stringify({ item_ids: itemIds, confirmed_category_id: confirmedCategoryId }),
    });
  },

  getItemCategories(): Promise<ItemCategoriesResult> {
    return request("/item-categories");
  },

  createItemCategory(data: {
    name: string;
    description?: string;
    skr03_konto?: string;
    skr03_konto_name?: string;
  }): Promise<{ message: string; category: ItemCategory }> {
    return request("/item-categories", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};
