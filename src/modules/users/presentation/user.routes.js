import { Router } from 'express';
import { authenticateToken } from '../../../shared/middlewares/auth.middleware.js';
import { requireRegisteredUser } from '../../../shared/middlewares/registered-user.middleware.js';
import { uploadProfile, parseFormData } from '../../../shared/middlewares/upload.middleware.js';

export const createUserRouter = ({ userController }) => {
  const router = Router();

  // Legacy & Flutter App routes (Mountable at /Admin or /api/v1/users)
  router.post('/checkUser', authenticateToken, userController.checkUser);
  router.post('/loginSignup', authenticateToken, parseFormData, userController.registerUser);
  router.post('/get_profile', authenticateToken, requireRegisteredUser, parseFormData, userController.getProfile);
  router.post('/updateProfile', authenticateToken, requireRegisteredUser, parseFormData, userController.updateProfile);
  router.post(
    '/profileUpdate',
    authenticateToken,
    requireRegisteredUser,
    uploadProfile.single('profile'),
    userController.updateProfilePicture
  );

  return router;
};

