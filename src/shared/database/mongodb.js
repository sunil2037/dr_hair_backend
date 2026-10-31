import mongoose from 'mongoose';
import { config } from '../../config/env.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../errors/index.js';
import { RateLimitCounterModel } from './models.js';

export const isMongoConnected = () => mongoose.connection.readyState === 1;

export const databaseStatus = () => {
  if (mongoose.connection.readyState === 1) return 'connected';
  return config.mongodb.uri ? 'disconnected' : 'memory';
};

export const connectDatabase = async () => {
  const uri = config.mongodb.uri;
  if (!uri) {
    logger.warn('MONGODB_URI is not set; using temporary in-memory storage.');
    return false;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      appName: 'dr-hair-backend',
    });
    await RateLimitCounterModel.init();
    logger.info('MongoDB Atlas connection established.');
    return true;
  } catch (err) {
    logger.warn(`MongoDB Atlas connection error: ${err.message}. Falling back to memory storage.`);
    return false;
  }
};

export const disconnectDatabase = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
};
