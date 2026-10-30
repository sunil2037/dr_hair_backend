import mongoose from 'mongoose';
import { config } from '../../config/env.js';
import { logger } from '../utils/logger.js';

export const isMongoConnected = () => mongoose.connection.readyState === 1;

export const databaseStatus = () => {
  if (isMongoConnected()) return 'connected';
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
