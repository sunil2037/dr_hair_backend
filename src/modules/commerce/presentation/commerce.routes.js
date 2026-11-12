import { Router } from 'express';
import { authenticateToken } from '../../../shared/middlewares/auth.middleware.js';
import { requirePermission } from '../../../shared/middlewares/admin.middleware.js';

export function createCommerceRouter({ commerceController }) {
  const router = Router();

  // Checkout (Patient authenticated)
  router.post('/checkout', authenticateToken, (req, res, next) => commerceController.checkout(req, res, next));

  // Payment Verification (Authenticated or token-bearing)
  router.post('/verify-payment', authenticateToken, (req, res, next) => commerceController.verifyPayment(req, res, next));

  // Public Gateway Webhook (HMAC signature verified inside controller)
  router.post('/webhook/payment', (req, res, next) => commerceController.handlePaymentWebhook(req, res, next));

  // Public/Patient Coupon list
  router.get('/coupons', (req, res, next) => commerceController.listCoupons(req, res, next));

  return router;
}

export function createPatientAddressRouter({ commerceController }) {
  const router = Router();
  router.use(authenticateToken);

  router.get('/', (req, res, next) => commerceController.listAddresses(req, res, next));
  router.post('/', (req, res, next) => commerceController.createAddress(req, res, next));
  router.put('/:addressId', (req, res, next) => commerceController.updateAddress(req, res, next));
  router.delete('/:addressId', (req, res, next) => commerceController.deleteAddress(req, res, next));
  router.post('/:addressId/default', (req, res, next) => commerceController.setDefaultAddress(req, res, next));

  return router;
}

export function createPatientOrderRouter({ commerceController }) {
  const router = Router();
  router.use(authenticateToken);

  router.get('/', (req, res, next) => commerceController.listPatientOrders(req, res, next));
  router.get('/:orderId', (req, res, next) => commerceController.getPatientOrder(req, res, next));
  router.post('/:orderId/cancel', (req, res, next) => commerceController.cancelPatientOrder(req, res, next));

  return router;
}

export function createAdminOrderRouter({ commerceController }) {
  const router = Router();
  router.use(authenticateToken);
  router.use(requirePermission('orders.manage'));

  router.get('/', (req, res, next) => commerceController.listAdminOrders(req, res, next));
  router.get('/:orderId', (req, res, next) => commerceController.getAdminOrder(req, res, next));
  router.patch('/:orderId/fulfillment', (req, res, next) => commerceController.updateFulfillment(req, res, next));
  router.post('/:orderId/shiprocket', (req, res, next) => commerceController.createShiprocketShipment(req, res, next));
  router.post('/:orderId/cancel', (req, res, next) => commerceController.cancelAdminOrder(req, res, next));
  router.post('/:orderId/refund', (req, res, next) => commerceController.refundAdminOrder(req, res, next));

  return router;
}

export function createAdminCouponRouter({ commerceController }) {
  const router = Router();
  router.use(authenticateToken);
  router.use(requirePermission('commerce.manage'));

  router.get('/', (req, res, next) => commerceController.listCoupons(req, res, next));
  router.post('/', (req, res, next) => commerceController.createCoupon(req, res, next));
  router.patch('/:id', (req, res, next) => commerceController.updateCoupon(req, res, next));
  router.delete('/:id', (req, res, next) => commerceController.deleteCoupon(req, res, next));

  return router;
}
