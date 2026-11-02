import { Router } from 'express';
import { optionalAuth } from '../../../shared/middlewares/auth.middleware.js';

export function createCartRouter({ cartController }) {
  const router = Router();

  router.use(optionalAuth);

  router.get('/', cartController.getCart);
  router.post('/items', cartController.addItem);
  router.patch('/items/:id', cartController.updateItem);
  router.delete('/items/:id', cartController.removeItem);
  router.delete('/', cartController.clearCart);

  router.post('/apply-coupon', cartController.applyCoupon);
  router.post('/apply-reward', cartController.applyCoupon);
  router.delete('/coupon', cartController.removeCoupon);
  router.post('/checkout', cartController.checkout);

  return router;
}
