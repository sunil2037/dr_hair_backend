import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/shared/database/mongodb.js';

let appPromise = null;

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      try {
        await connectDatabase();
      } catch (err) {
        console.warn('Database init warning:', err?.message || err);
      }
      const { app } = createApp();
      return app;
    })();
  }
  return appPromise;
}

export default async function handler(req, res) {
  const app = await getApp();
  return app(req, res);
}
