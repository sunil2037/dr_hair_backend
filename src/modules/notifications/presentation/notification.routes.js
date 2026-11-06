import { Router } from 'express';
import { authenticateToken, optionalAuth } from '../../../shared/middlewares/auth.middleware.js';

export const createNotificationRouter = ({ notificationController }) => {
  const router = Router();
  
  // Patient in-app notifications
  router.get('/', authenticateToken, notificationController.listNotifications);
  router.patch('/:id/read', authenticateToken, notificationController.markAsRead);
  router.post('/read-all', authenticateToken, notificationController.markAllAsRead);

  // Device token management (optionalAuth supports both guest app installations and logged-in patients)
  router.post('/device-tokens', optionalAuth, notificationController.registerDeviceToken);
  router.delete('/device-tokens', optionalAuth, notificationController.removeDeviceToken);
  
  return router;
};
