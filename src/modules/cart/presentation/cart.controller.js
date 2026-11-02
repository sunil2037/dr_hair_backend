export class CartController {
  constructor({
    getCartUseCase,
    addToCartUseCase,
    updateCartItemUseCase,
    removeCartItemUseCase,
    clearCartUseCase,
    applyCouponUseCase,
  }) {
    this.getCartUseCase = getCartUseCase;
    this.addToCartUseCase = addToCartUseCase;
    this.updateCartItemUseCase = updateCartItemUseCase;
    this.removeCartItemUseCase = removeCartItemUseCase;
    this.clearCartUseCase = clearCartUseCase;
    this.applyCouponUseCase = applyCouponUseCase;
  }

  _resolveUserId(req) {
    if (req.user?.id) return String(req.user.id);
    if (req.user?.userId) return String(req.user.userId);
    const guestHeader = req.headers['x-guest-session-id'] || req.headers['x-session-id'];
    if (guestHeader) return String(guestHeader).trim();
    if (req.query?.session_id) return String(req.query.session_id).trim();
    return 'guest_default';
  }

  getCart = async (req, res, next) => {
    try {
      const userId = this._resolveUserId(req);
      const data = await this.getCartUseCase.execute(userId);
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      next(error);
    }
  };

  addItem = async (req, res, next) => {
    try {
      const userId = this._resolveUserId(req);
      const { productId, product_id, planTitle, plan, planId, plan_id, quantity } = req.body || {};
      const data = await this.addToCartUseCase.execute({
        userId,
        productId: productId || product_id,
        planTitle: planTitle || plan,
        planId: planId || plan_id,
        quantity: quantity || 1,
      });
      res.status(200).json({ status: 'success', data, message: 'Item added to cart' });
    } catch (error) {
      next(error);
    }
  };

  updateItem = async (req, res, next) => {
    try {
      const userId = this._resolveUserId(req);
      const itemId = req.params.id;
      const { quantity } = req.body || {};
      const data = await this.updateCartItemUseCase.execute({
        userId,
        itemId,
        quantity,
      });
      res.status(200).json({ status: 'success', data, message: 'Cart item updated' });
    } catch (error) {
      next(error);
    }
  };

  removeItem = async (req, res, next) => {
    try {
      const userId = this._resolveUserId(req);
      const itemId = req.params.id;
      const data = await this.removeCartItemUseCase.execute({
        userId,
        itemId,
      });
      res.status(200).json({ status: 'success', data, message: 'Item removed from cart' });
    } catch (error) {
      next(error);
    }
  };

  clearCart = async (req, res, next) => {
    try {
      const userId = this._resolveUserId(req);
      const data = await this.clearCartUseCase.execute(userId);
      res.status(200).json({ status: 'success', data, message: 'Cart cleared' });
    } catch (error) {
      next(error);
    }
  };

  applyCoupon = async (req, res, next) => {
    try {
      const userId = this._resolveUserId(req);
      const { code } = req.body || {};
      const data = await this.applyCouponUseCase.execute({
        userId,
        code,
      });
      res.status(200).json({ status: 'success', data, message: `Coupon ${code} applied` });
    } catch (error) {
      next(error);
    }
  };

  removeCoupon = async (req, res, next) => {
    try {
      const userId = this._resolveUserId(req);
      const data = await this.applyCouponUseCase.remove({ userId });
      res.status(200).json({ status: 'success', data, message: 'Coupon removed' });
    } catch (error) {
      next(error);
    }
  };
}
