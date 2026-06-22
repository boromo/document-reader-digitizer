import { Router } from "express";
import { getDb } from "../db/database.js";

export const reportsRouter = Router();

interface StatusCount {
  status: string;
  count: number;
}

interface TypeCount {
  type: string;
  count: number;
}

interface DailyCount {
  date: string;
  count: number;
}

// GET /api/reports/summary — Dashboard aggregate stats
reportsRouter.get("/summary", (_req, res) => {
  const db = getDb();

  const totalDocs = (
    db.prepare("SELECT COUNT(*) as count FROM documents").get() as {
      count: number;
    }
  ).count;

  const byStatus = db
    .prepare(
      "SELECT status, COUNT(*) as count FROM documents GROUP BY status ORDER BY count DESC"
    )
    .all() as StatusCount[];

  const byType = db
    .prepare(
      `SELECT COALESCE(c.confirmed_type, c.ai_suggested_type, 'unclassified') as type,
              COUNT(*) as count
       FROM documents d
       LEFT JOIN classifications c ON c.document_id = d.id
       GROUP BY type
       ORDER BY count DESC`
    )
    .all() as TypeCount[];

  const avgConfidence = db
    .prepare(
      "SELECT AVG(ocr_confidence) as avg FROM extracted_data WHERE ocr_confidence IS NOT NULL"
    )
    .get() as { avg: number | null };

  const recentUploads = db
    .prepare(
      `SELECT DATE(upload_date) as date, COUNT(*) as count
       FROM documents
       WHERE upload_date >= DATE('now', '-30 days')
       GROUP BY DATE(upload_date)
       ORDER BY date`
    )
    .all() as DailyCount[];

  const processingStats = db
    .prepare(
      `SELECT status, COUNT(*) as count
       FROM processing_jobs
       GROUP BY status`
    )
    .all() as StatusCount[];

  const totalStorageBytes = (
    db
      .prepare("SELECT COALESCE(SUM(file_size_bytes), 0) as total FROM documents")
      .get() as { total: number }
  ).total;

  res.json({
    totalDocuments: totalDocs,
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.count])),
    byType: Object.fromEntries(byType.map((r) => [r.type, r.count])),
    avgOcrConfidence: avgConfidence.avg
      ? Math.round(avgConfidence.avg * 10) / 10
      : null,
    recentUploads,
    processingStats: Object.fromEntries(
      processingStats.map((r) => [r.status, r.count])
    ),
    totalStorageBytes,
  });
});

// GET /api/reports/export?format=csv|json — Export documents
reportsRouter.get("/export", (req, res) => {
  const format = (req.query.format as string) || "json";
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT
         d.id,
         d.original_filename,
         d.mime_type,
         d.file_size_bytes,
         d.upload_date,
         d.status,
         COALESCE(c.confirmed_type, c.ai_suggested_type) as document_type,
         c.ai_confidence as classification_confidence,
         ed.ocr_confidence,
         ed.summary,
         ed.sentiment
       FROM documents d
       LEFT JOIN classifications c ON c.document_id = d.id
       LEFT JOIN extracted_data ed ON ed.document_id = d.id
       ORDER BY d.upload_date DESC`
    )
    .all() as Record<string, unknown>[];

  if (format === "csv") {
    if (rows.length === 0) {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="documents.csv"'
      );
      res.send("");
      return;
    }

    const headers = Object.keys(rows[0]);
    const csvLines = [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((h) => {
            const val = row[h];
            if (val === null || val === undefined) return "";
            const str = String(val);
            if (str.includes(",") || str.includes('"') || str.includes("\n")) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          })
          .join(",")
      ),
    ];

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="documents.csv"'
    );
    res.send(csvLines.join("\n"));
  } else {
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="documents.json"'
    );
    res.json(rows);
  }
});
