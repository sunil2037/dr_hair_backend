import { Router } from 'express';
import { authenticateToken } from '../../../shared/middlewares/auth.middleware.js';

export const createNotificationRouter = ({ notificationController }) => {
  const router = Router();
  router.post('/device-tokens', authenticateToken, notificationController.registerDeviceToken);
  router.delete('/device-tokens', authenticateToken, notificationController.removeDeviceToken);
  return router;
};
