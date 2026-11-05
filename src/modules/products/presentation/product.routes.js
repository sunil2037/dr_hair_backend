import { Router } from 'express';
import { authenticateToken } from '../../../shared/middlewares/auth.middleware.js';
import { requireSuperAdmin } from '../../../shared/middlewares/admin.middleware.js';

export function createProductRouters({ productController }) {
  const publicRouter = Router();
  publicRouter.get('/categories', productController.listCategories);
  publicRouter.get('/', productController.list);
  publicRouter.get('/:id', productController.getById);

  const adminRouter = Router();
  adminRouter.use(authenticateToken, requireSuperAdmin);
  adminRouter.get('/categories', productController.listCategories);
  adminRouter.get('/', productController.listAdmin);
  adminRouter.get('/:id', productController.getById);
  adminRouter.post('/', productController.create);
  adminRouter.patch('/:id', productController.update);
  adminRouter.delete('/:id', productController.delete);

  return { publicRouter, adminRouter };
}
