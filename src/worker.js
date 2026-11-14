import { createContainer } from './container.js';
import { config } from './config/env.js';
import { connectDatabase, disconnectDatabase, isMongoConnected } from './shared/database/mongodb.js';
import { logger } from './shared/utils/logger.js';

const connected = await connectDatabase();
if (!connected || !isMongoConnected()) {
  throw new Error('The assessment worker requires a persistent MongoDB connection.');
}

const container = createContainer();
const processor = container.useCases.processQueuedAiAssessmentUseCase;
let stopping = false;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const stop = (signal) => {
  if (stopping) return;
  stopping = true;
  logger.info(`Assessment worker received ${signal}; finishing current job before shutdown.`);
};

process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));

logger.info(`Assessment worker started in ${config.env} mode.`);
while (!stopping) {
  try {
    const processed = await processor.processOne();
    if (!processed) await delay(1500);
  } catch {
    logger.error('Assessment worker could not claim a job; retrying shortly.');
    await delay(3000);
  }
}
await disconnectDatabase();
