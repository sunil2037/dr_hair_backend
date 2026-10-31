import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/shared/database/mongodb.js';

let appPromise = null;

async function getApp() {
  if (!appPromise) {
    const pending = (async () => {
      await connectDatabase();
      const { app } = createApp();
      return app;
    })();
    appPromise = pending.catch((error) => {
      appPromise = null;
      throw error;
    });
  }
  return appPromise;
}

export default async function handler(req, res) {
  const app = await getApp();
  return app(req, res);
}
