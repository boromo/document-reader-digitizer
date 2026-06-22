import Queue from "better-queue";
import path from "node:path";
import { getDb } from "../db/database.js";
import { config } from "../config.js";
import { extractText } from "./ocr-service.js";
import { generateThumbnail } from "./image-preprocessor.js";
import {
  classifyDocument,
  extractFields,
  summarizeDocument,
  analyzeSentiment,
} from "./llm-service.js";
import {
  classifyDocumentWithVision,
} from "./vision-extractor.js";
import { runAccountingAgent } from "./accounting-agent.js";
import { extractAndSaveReceiptItems } from "./receipt-item-service.js";
import { getOriginalFilePath } from "./upload-service.js";
import { updateDocumentStatus } from "./document-service.js";
import type { Document, ProcessingJob, DocumentType } from "../types/models.js";
import { logger } from "../logger.js";

interface PipelineJob {
  documentId: number;
  jobId: number;
}

let processingQueue: Queue | null = null;

function updateJobStatus(
  jobId: number,
  status: ProcessingJob["status"],
  errorMessage?: string
): void {
  const db = getDb();
  const now = new Date().toISOString();

  if (status === "running") {
    db.prepare(
      "UPDATE processing_jobs SET status = ?, started_at = ? WHERE id = ?"
    ).run(status, now, jobId);
  } else if (status === "completed") {
    db.prepare(
      "UPDATE processing_jobs SET status = ?, completed_at = ? WHERE id = ?"
    ).run(status, now, jobId);
  } else if (status === "failed") {
    db.prepare(
      "UPDATE processing_jobs SET status = ?, completed_at = ?, error_message = ?, retry_count = retry_count + 1 WHERE id = ?"
    ).run(status, now, errorMessage ?? null, jobId);
  }
}

async function processDocument(job: PipelineJob): Promise<void> {
  const { documentId, jobId } = job;
  const db = getDb();

  // Load document
  const doc = db
    .prepare("SELECT * FROM documents WHERE id = ?")
    .get(documentId) as Document | undefined;

  if (!doc) {
    throw new Error(`Document ${documentId} not found`);
  }

  logger.info(
    { documentId, filename: doc.original_filename },
    "Processing started"
  );

  // Update statuses
  updateJobStatus(jobId, "running");
  updateDocumentStatus(documentId, "processing");

  const filePath = getOriginalFilePath(doc.stored_path);

  // Step 1: Generate thumbnail
  try {
    const thumbnailFilename = path.basename(
      doc.stored_path,
      path.extname(doc.stored_path)
    ) + ".webp";
    const thumbnailPath = path.join(config.thumbnailsDir, thumbnailFilename);
    await generateThumbnail(filePath, thumbnailPath);

    const relativeThumbnail = path.relative(config.storageDir, thumbnailPath);
    db.prepare("UPDATE documents SET thumbnail_path = ? WHERE id = ?").run(
      relativeThumbnail,
      documentId
    );
  } catch (err) {
    logger.warn({ documentId, err }, "Thumbnail generation failed, continuing");
  }

  // Step 2: OCR — Extract text
  const ocrResult = await extractText(filePath, doc.mime_type);

  if (!ocrResult.text || ocrResult.text.trim().length === 0) {
    // No text extracted — still move to review so user can see
    db.prepare(
      `INSERT INTO extracted_data (document_id, raw_text, ocr_confidence, processed_at)
       VALUES (?, '', ?, datetime('now'))`
    ).run(documentId, 0);

    updateDocumentStatus(documentId, "review");
    updateJobStatus(jobId, "completed");
    logger.warn({ documentId }, "No text extracted from document");
    return;
  }

  // Store raw OCR text
  db.prepare(
    `INSERT INTO extracted_data (document_id, raw_text, ocr_confidence, processed_at)
     VALUES (?, ?, ?, datetime('now'))`
  ).run(documentId, ocrResult.text, ocrResult.confidence);

  // Step 3: Classify document — vision primary, text LLM fallback
  let classifiedType = "other";
  let classificationConfidence = 0;

  try {
    let classification;
    try {
      const types = db.prepare("SELECT * FROM document_types").all() as DocumentType[];
      classification = await classifyDocumentWithVision(filePath, types);
      logger.info({ documentId }, "Document classified via vision LLM");
    } catch (visionErr) {
      logger.warn({ documentId, err: visionErr }, "Vision classification failed — falling back to text LLM");
      classification = await classifyDocument(ocrResult.text);
    }
    classifiedType = classification.type;
    classificationConfidence = classification.confidence;

    db.prepare(
      `INSERT INTO classifications (document_id, ai_suggested_type, ai_confidence)
       VALUES (?, ?, ?)`
    ).run(documentId, classifiedType, classificationConfidence);
  } catch (err) {
    logger.error({ documentId, err }, "Classification failed, defaulting to 'other'");
    db.prepare(
      `INSERT INTO classifications (document_id, ai_suggested_type, ai_confidence)
       VALUES (?, 'other', 0)`
    ).run(documentId);
  }

  // Step 4: Extract key fields based on classification — text LLM (vision handled by accounting agent)
  try {
    const extraction = await extractFields(ocrResult.text, classifiedType);

    for (const [fieldName, fieldValue] of Object.entries(extraction.fields)) {
      const valueStr =
        typeof fieldValue === "object"
          ? JSON.stringify(fieldValue)
          : String(fieldValue ?? "");

      db.prepare(
        `INSERT INTO extracted_fields (document_id, field_name, field_value, ai_suggested_value, confidence)
         VALUES (?, ?, ?, ?, ?)`
      ).run(documentId, fieldName, valueStr, valueStr, classificationConfidence);
    }
  } catch (err) {
    logger.error({ documentId, err }, "Field extraction failed, continuing");
  }

  // Step 5: Generate summary + sentiment
  try {
    const [summaryResult, sentimentResult] = await Promise.all([
      summarizeDocument(ocrResult.text),
      analyzeSentiment(ocrResult.text),
    ]);

    db.prepare(
      `UPDATE extracted_data SET summary = ?, sentiment = ? WHERE document_id = ?`
    ).run(summaryResult.summary, sentimentResult.sentiment, documentId);
  } catch (err) {
    logger.error({ documentId, err }, "Summary/sentiment failed, continuing");
  }

  // Done — move to review
  updateDocumentStatus(documentId, "review");
  updateJobStatus(jobId, "completed");

  logger.info(
    { documentId, type: classifiedType, confidence: classificationConfidence },
    "Processing completed"
  );

  // Step 6: Run Accounting Agent (async, non-blocking for pipeline status)
  // The agent writes to accounting_records — errors are caught internally.
  // Pass filePath so the agent can use the vision LLM for layout-aware extraction.
  if (ocrResult.text && ocrResult.text.trim().length > 0) {
    runAccountingAgent(documentId, ocrResult.text, filePath)
      .then(async () => {
        // Step 7: Extract receipt line items when belegart = quittung
        // Run after the accounting agent so the accounting_records row exists for sum validation.
        try {
          const db = getDb();
          const acctRow = db
            .prepare("SELECT belegart FROM accounting_records WHERE document_id = ?")
            .get(documentId) as { belegart: string } | undefined;
          if (acctRow?.belegart === "quittung") {
            await extractAndSaveReceiptItems(documentId, filePath);
          }
        } catch (err) {
          logger.error({ documentId, err }, "Receipt item extraction failed");
        }
      })
      .catch((err) => {
        logger.error({ documentId, err }, "Accounting agent post-pipeline run failed");
      });
  }
}

export function initProcessingQueue(): void {
  processingQueue = new Queue(
    (job: PipelineJob, cb: (err?: Error | null) => void) => {
      processDocument(job)
        .then(() => cb(null))
        .catch((err) => {
          logger.error(
            { documentId: job.documentId, err },
            "Pipeline processing failed"
          );
          updateJobStatus(job.jobId, "failed", String(err));
          updateDocumentStatus(job.documentId, "pending");
          cb(err as Error);
        });
    },
    {
      concurrent: 1, // Process one document at a time (LLM is the bottleneck)
      maxRetries: 2,
      retryDelay: 5000,
      afterProcessDelay: 500,
    }
  );

  processingQueue.on("task_finish", (taskId: string) => {
    logger.debug({ taskId }, "Queue task finished");
  });

  processingQueue.on("task_failed", (taskId: string, err: Error) => {
    logger.error({ taskId, error: err.message }, "Queue task failed");
  });

  // Resume any jobs that were left in 'queued' or 'running' state from previous shutdown
  resumePendingJobs();

  logger.info("Processing queue initialized");
}

function resumePendingJobs(): void {
  const db = getDb();
  const pendingJobs = db
    .prepare(
      `SELECT pj.id as job_id, pj.document_id
       FROM processing_jobs pj
       WHERE pj.status IN ('queued', 'running')
       ORDER BY pj.created_at ASC`
    )
    .all() as Array<{ job_id: number; document_id: number }>;

  if (pendingJobs.length > 0) {
    logger.info(
      { count: pendingJobs.length },
      "Resuming pending processing jobs"
    );
    for (const job of pendingJobs) {
      enqueueDocument(job.document_id, job.job_id);
    }
  }
}

export function enqueueDocument(documentId: number, jobId: number): void {
  if (!processingQueue) {
    throw new Error("Processing queue not initialized");
  }

  processingQueue.push({ documentId, jobId });
  logger.info({ documentId, jobId }, "Document enqueued for processing");
}

export function getQueueStats(): {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
} {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT status, COUNT(*) as count FROM processing_jobs GROUP BY status`
    )
    .all() as Array<{ status: string; count: number }>;

  const stats = { pending: 0, processing: 0, completed: 0, failed: 0 };
  for (const row of rows) {
    if (row.status === "queued") stats.pending = row.count;
    else if (row.status === "running") stats.processing = row.count;
    else if (row.status === "completed") stats.completed = row.count;
    else if (row.status === "failed") stats.failed = row.count;
  }
  return stats;
}
