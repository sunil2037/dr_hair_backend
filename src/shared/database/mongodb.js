import mongoose from 'mongoose';
import { config } from '../../config/env.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../errors/index.js';
import { RateLimitCounterModel } from './models.js';

export const isMongoConnected = () => {
  const connected = mongoose.connection.readyState === 1;
  if (!connected && config.env === 'production') {
    throw new AppError('Database is unavailable. Request cannot be served safely.', 503);
  }
  return connected;
};

export const databaseStatus = () => {
  if (mongoose.connection.readyState === 1) return 'connected';
  return config.mongodb.uri ? 'disconnected' : 'memory';
};

export const connectDatabase = async () => {
  const uri = config.mongodb.uri;
  if (!uri) {
    if (config.env === 'production') throw new Error('MONGODB_URI is required in production.');
    logger.warn('MONGODB_URI is not set; using temporary in-memory storage in development.');
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
    if (config.env === 'production') {
      logger.error(`MongoDB Atlas connection failed in production: ${err.message}`);
      throw err;
    }
    logger.warn(`MongoDB Atlas connection error: ${err.message}. Falling back to memory storage in development.`);
    return false;
  }
};

export const disconnectDatabase = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
};
