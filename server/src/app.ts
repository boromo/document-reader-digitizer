import express from "express";
import cors from "cors";
import session from "express-session";
import helmet from "helmet";
import path from "node:path";
import { config } from "./config.js";
import { healthRouter } from "./routes/health.js";
import { documentsRouter } from "./routes/documents.js";
import { jobsRouter } from "./routes/jobs.js";
import { typesRouter } from "./routes/types.js";
import { reportsRouter } from "./routes/reports.js";
import { tagsRouter } from "./routes/tags.js";
import { documentTagsRouter } from "./routes/document-tags.js";
import { accountingRouter } from "./routes/accounting.js";
import { bankTransactionsRouter } from "./routes/bank-transactions.js";
import { receiptItemsRouter } from "./routes/receipt-items.js";
import { errorHandler } from "./middleware/error-handler.js";
import { apiLimiter, uploadLimiter } from "./middleware/rate-limiter.js";
import { logger } from "./logger.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  app.use(
    helmet({
      contentSecurityPolicy: false, // SPA serves its own assets
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(
    session({
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false, // localhost only
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      },
    })
  );

  // Serve React SPA in production
  const clientDistPath = path.resolve(process.cwd(), "client", "dist");
  app.use(express.static(clientDistPath));

  // API routes
  app.use("/api/health", healthRouter);
  app.use("/api/documents/upload", uploadLimiter);
  app.use("/api/documents", documentTagsRouter); // tag assignment endpoints (must come before documentsRouter)
  app.use("/api/documents", apiLimiter, documentsRouter);
  app.use("/api/jobs", apiLimiter, jobsRouter);
  app.use("/api/types", apiLimiter, typesRouter);
  app.use("/api/reports", apiLimiter, reportsRouter);
  app.use("/api/tags", apiLimiter, tagsRouter);
  app.use("/api/accounting", apiLimiter, accountingRouter);
  app.use("/api/bank-transactions", apiLimiter, bankTransactionsRouter);
  app.use("/api", apiLimiter, receiptItemsRouter);

  // SPA fallback — serve index.html for non-API routes
  app.get("*", (_req, res, next) => {
    if (_req.path.startsWith("/api")) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, "index.html"), (err) => {
      if (err) {
        // Client not built yet — that's fine in dev
        logger.debug("Client build not found, skipping SPA fallback");
        next();
      }
    });
  });

  app.use(errorHandler);

  return app;
}
