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
    if (config.env === 'production') {
      throw new Error('MONGODB_URI must be configured in production.');
    }
    logger.warn('MONGODB_URI is not set; using temporary in-memory storage in development.');
    return false;
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    appName: 'dr-hair-backend',
  });
  logger.info('MongoDB Atlas connection established.');
  return true;
};

export const disconnectDatabase = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
};
