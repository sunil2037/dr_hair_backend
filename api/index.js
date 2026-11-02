import { createApp } from '../src/app.js';
import { connectDatabase, isMongoConnected } from '../src/shared/database/mongodb.js';

let appInstance = null;

async function getApp() {
  if (!appInstance) {
    await connectDatabase();
    const { app } = createApp();
    appInstance = app;
  } else if (!isMongoConnected()) {
    await connectDatabase();
  }
  return appInstance;
}

export default async function handler(req, res) {
  const app = await getApp();
  return app(req, res);
}
