import { Router } from 'express';
import { authenticateToken } from '../../../shared/middlewares/auth.middleware.js';
import { uploadProfile, parseFormData } from '../../../shared/middlewares/upload.middleware.js';

export const createUserRouter = ({ userController }) => {
  const router = Router();

  // Legacy & Flutter App routes (Mountable at /Admin or /api/v1/users)
  router.post('/checkUser', authenticateToken, userController.checkUser);
  router.post('/loginSignup', parseFormData, userController.registerUser);
  router.post('/get_profile', authenticateToken, parseFormData, userController.getProfile);
  router.post('/updateProfile', authenticateToken, parseFormData, userController.updateProfile);
  router.post(
    '/profileUpdate',
    authenticateToken,
    uploadProfile.single('profile'),
    userController.updateProfilePicture
  );

  return router;
};

