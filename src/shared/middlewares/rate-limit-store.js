import { isMongoConnected } from '../database/mongodb.js';
import { MongoRateLimitStore } from './mongo-rate-limit-store.js';

export const createRateLimitStore = (namespace) => {
  try {
    return isMongoConnected() ? new MongoRateLimitStore(namespace) : undefined;
  } catch {
    return undefined;
  }
};
