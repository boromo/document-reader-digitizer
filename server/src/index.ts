import fs from "node:fs";
import { config } from "./config.js";
import { createApp } from "./app.js";
import { initDatabase } from "./db/database.js";
import { initProcessingQueue } from "./services/processing-pipeline.js";
import { logger } from "./logger.js";

function ensureDirectories() {
  const dirs = [
    config.dataDir,
    config.storageDir,
    config.originalsDir,
    config.thumbnailsDir,
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function main() {
  logger.info("Starting Document Reader & Digitizer...");

  ensureDirectories();
  logger.info("Directories verified");

  initDatabase();
  logger.info("Database initialized");

  initProcessingQueue();
  logger.info("Processing queue initialized");

  const app = createApp();
  app.listen(config.port, () => {
    logger.info(`Server running at http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  logger.fatal(err, "Failed to start server");
  process.exit(1);
});
