import { Router } from 'express';
import { authenticateToken } from '../../../shared/middlewares/auth.middleware.js';
import { requireRegisteredUser } from '../../../shared/middlewares/registered-user.middleware.js';
import { uploadScalpPhotos } from '../../../shared/middlewares/upload.middleware.js';

export const createHairTestRouter = ({ hairTestController }) => {
  const router = Router();

  const scalpUploadFields = uploadScalpPhotos.fields([
    { name: 'photo_front', maxCount: 1 },
    { name: 'photo_top', maxCount: 1 },
    { name: 'photo_left', maxCount: 1 },
    { name: 'photo_right', maxCount: 1 },
    { name: 'photo_back', maxCount: 1 },
  ]);

  // Legacy & Flutter App routes:
  // POST /HairTest/submit_form
  router.post('/submit_form', authenticateToken, requireRegisteredUser, scalpUploadFields, hairTestController.submitForm);

  // POST /HairTest/hair_test
  router.post('/hair_test', authenticateToken, requireRegisteredUser, hairTestController.getHairTests);

  return router;
};

