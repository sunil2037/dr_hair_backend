import { config } from '../../config/env.js';
import { MongoRateLimitStore } from './mongo-rate-limit-store.js';

export const createRateLimitStore = (namespace) =>
  config.env === 'production' ? new MongoRateLimitStore(namespace) : undefined;
