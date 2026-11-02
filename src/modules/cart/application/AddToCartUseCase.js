import { BadRequestError, NotFoundError } from '../../../shared/errors/index.js';
import { CartItem } from '../domain/Cart.js';

export class AddToCartUseCase {
  constructor({ cartRepository, productRepository }) {
    this.cartRepository = cartRepository;
    this.productRepository = productRepository;
  }

  async execute({ userId, productId, planTitle, planId, quantity = 1 }) {
    if (!productId) {
      throw new BadRequestError('Product ID is required.');
    }

    const product = await this.productRepository.findById(productId);
    if (!product) {
      throw new NotFoundError(`Product with ID "${productId}" not found.`);
    }

    const plans = product.supply_plans || product.supplyPlans || [];
    const targetPlan = plans.find((p) =>
      (planId && String(p.id) === String(planId)) ||
      (planTitle && String(p.title).toLowerCase() === String(planTitle).toLowerCase())
    ) || plans[0] || {
      title: 'Standard',
      subtitle: product.subtitle || '',
      price: product.price,
      mrp: product.compare_at_price || product.compareAtPrice || product.price,
    };

    const cart = await this.cartRepository.getCart(userId);
    const cartItem = new CartItem({
      productId: product.id,
      title: product.name,
      desc: targetPlan.subtitle || product.subtitle || '',
      plan: targetPlan.title,
      plan_id: targetPlan.id || targetPlan.title,
      price: targetPlan.price || product.price,
      mrp: targetPlan.mrp || product.compare_at_price || product.price,
      quantity: Number(quantity) || 1,
      image: Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : '',
    });

    cart.addItem(cartItem);
    await this.cartRepository.saveCart(cart);
    return cart.toJSON();
  }
}
