import { NotFoundError } from '../../../shared/errors/index.js';
import { Product } from '../domain/Product.js';

export class UpdateProductUseCase {
  constructor({ productRepository }) {
    this.productRepository = productRepository;
  }

  async execute({ id, ...payload }) {
    if (!id) {
      throw new NotFoundError('Product ID is required.');
    }
    const existing = await this.productRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Product not found.');
    }

    const merged = { ...existing, ...payload };
    const validated = Product.fromPayload(merged, id);
    const updated = await this.productRepository.update(id, validated.toJSON());
    return updated;
  }
}
