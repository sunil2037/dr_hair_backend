import { Router } from 'express';
import { authenticateToken } from '../../../shared/middlewares/auth.middleware.js';

export const createNotificationRouter = ({ notificationController }) => {
  const router = Router();
  
  // Patient in-app notifications
  router.get('/', authenticateToken, notificationController.listNotifications);
  router.patch('/:id/read', authenticateToken, notificationController.markAsRead);
  router.post('/read-all', authenticateToken, notificationController.markAllAsRead);

  // Device token management
  router.post('/device-tokens', authenticateToken, notificationController.registerDeviceToken);
  router.delete('/device-tokens', authenticateToken, notificationController.removeDeviceToken);
  
  return router;
};
