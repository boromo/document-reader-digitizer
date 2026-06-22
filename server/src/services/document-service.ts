import { getDb } from "../db/database.js";
import type {
  Document,
  ExtractedData,
  Classification,
  ExtractedField,
  ProcessingJob,
} from "../types/models.js";
import { getTagsForDocument } from "./tag-service.js";
import type { Tag } from "../types/models.js";

export interface DocumentWithDetails extends Document {
  extracted_data: ExtractedData | null;
  classification: Classification | null;
  extracted_fields: ExtractedField[];
  processing_job: ProcessingJob | null;
  tags: Tag[];
}

export interface DocumentListParams {
  // Existing
  status?: string;
  page?: number;
  limit?: number;
  search?: string;
  tagIds?: number[];
  // Advanced filters
  statuses?: string[];
  types?: string[];
  from?: string;
  to?: string;
  minSize?: number;
  maxSize?: number;
  sort?: "upload_date" | "original_filename" | "file_size_bytes" | "status";
  dir?: "asc" | "desc";
}

export interface DocumentListResult {
  documents: DocumentWithDetails[];
  total: number;
  page: number;
  limit: number;
}

export function createDocument(params: {
  originalFilename: string;
  storedPath: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadedBy: number | null;
}): Document {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO documents (original_filename, stored_path, mime_type, file_size_bytes, uploaded_by, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`
    )
    .run(
      params.originalFilename,
      params.storedPath,
      params.mimeType,
      params.fileSizeBytes,
      params.uploadedBy
    );

  return getDocumentById(Number(result.lastInsertRowid))!;
}

export function getDocumentById(id: number): Document | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM documents WHERE id = ?").get(id);
  return (row as Document) ?? null;
}

export function getDocumentWithDetails(
  id: number
): DocumentWithDetails | null {
  const doc = getDocumentById(id);
  if (!doc) return null;

  const db = getDb();

  const extractedData = db
    .prepare("SELECT * FROM extracted_data WHERE document_id = ?")
    .get(id) as ExtractedData | undefined;

  const classification = db
    .prepare("SELECT * FROM classifications WHERE document_id = ?")
    .get(id) as Classification | undefined;

  const extractedFields = db
    .prepare("SELECT * FROM extracted_fields WHERE document_id = ?")
    .all(id) as ExtractedField[];

  const processingJob = db
    .prepare("SELECT * FROM processing_jobs WHERE document_id = ?")
    .get(id) as ProcessingJob | undefined;

  const tags = getTagsForDocument(id);

  return {
    ...doc,
    extracted_data: extractedData ?? null,
    classification: classification ?? null,
    extracted_fields: extractedFields,
    processing_job: processingJob ?? null,
    tags,
  };
}

export function listDocuments(
  params: DocumentListParams
): DocumentListResult {
  const db = getDb();
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[] = [];

  // Single status (legacy) or multi-status via statuses[]
  const statuses = params.statuses && params.statuses.length > 0
    ? params.statuses
    : params.status
    ? [params.status]
    : [];
  if (statuses.length > 0) {
    const placeholders = statuses.map(() => "?").join(",");
    conditions.push(`d.status IN (${placeholders})`);
    values.push(...statuses);
  }

  if (params.search) {
    conditions.push(
      `d.id IN (SELECT ed.document_id FROM extracted_data ed
        JOIN documents_fts fts ON fts.rowid = ed.id
        WHERE documents_fts MATCH ?)`
    );
    values.push(params.search);
  }

  if (params.tagIds && params.tagIds.length > 0) {
    // Only include documents that have ALL selected tags
    const tagPlaceholders = params.tagIds.map(() => "?").join(",");
    conditions.push(
      `d.id IN (
        SELECT dt.document_id FROM document_tags dt
        WHERE dt.tag_id IN (${tagPlaceholders})
        GROUP BY dt.document_id
        HAVING COUNT(DISTINCT dt.tag_id) = ${params.tagIds.length}
      )`
    );
    values.push(...params.tagIds);
  }

  // Filter by confirmed/AI-suggested type
  if (params.types && params.types.length > 0) {
    const typePlaceholders = params.types.map(() => "?").join(",");
    conditions.push(
      `d.id IN (
        SELECT c.document_id FROM classifications c
        WHERE COALESCE(c.confirmed_type, c.ai_suggested_type) IN (${typePlaceholders})
      )`
    );
    values.push(...params.types);
  }

  // Date range
  if (params.from) {
    conditions.push("d.upload_date >= ?");
    values.push(params.from);
  }
  if (params.to) {
    // Add end-of-day to make it inclusive
    conditions.push("d.upload_date <= ?");
    values.push(params.to + "T23:59:59.999Z");
  }

  // File size range
  if (params.minSize !== undefined && params.minSize !== null) {
    conditions.push("d.file_size_bytes >= ?");
    values.push(params.minSize);
  }
  if (params.maxSize !== undefined && params.maxSize !== null) {
    conditions.push("d.file_size_bytes <= ?");
    values.push(params.maxSize);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Sort
  const allowedSortFields = ["upload_date", "original_filename", "file_size_bytes", "status"] as const;
  const sortField = params.sort && allowedSortFields.includes(params.sort)
    ? `d.${params.sort}`
    : "d.upload_date";
  const sortDir = params.dir === "asc" ? "ASC" : "DESC";

  const total = db
    .prepare(
      `SELECT COUNT(*) as count FROM documents d ${whereClause}`
    )
    .get(...values) as { count: number };

  const docs = db
    .prepare(
      `SELECT d.* FROM documents d ${whereClause}
       ORDER BY ${sortField} ${sortDir}
       LIMIT ? OFFSET ?`
    )
    .all(...values, limit, offset) as Document[];

  // Always include tags for each document
  const documents: DocumentWithDetails[] = docs.map((doc) => {
    const details = getDocumentWithDetails(doc.id);
    // Should never be null, but fallback to base doc
    return details ?? { ...doc, tags: [], extracted_data: null, classification: null, extracted_fields: [], processing_job: null };
  });

  return {
    documents,
    total: total.count,
    page,
    limit,
  };
}

export function updateDocumentStatus(
  id: number,
  status: Document["status"]
): void {
  const db = getDb();
  db.prepare("UPDATE documents SET status = ? WHERE id = ?").run(status, id);
}

export function deleteDocument(id: number): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM documents WHERE id = ?").run(id);
  return result.changes > 0;
}

export function createProcessingJob(documentId: number): ProcessingJob {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO processing_jobs (document_id, status) VALUES (?, 'queued')`
    )
    .run(documentId);

  return db
    .prepare("SELECT * FROM processing_jobs WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as ProcessingJob;
}
