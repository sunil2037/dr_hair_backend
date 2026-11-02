import { Product } from '../domain/Product.js';

export class CreateProductUseCase {
  constructor({ productRepository }) {
    this.productRepository = productRepository;
  }

  async execute(payload = {}) {
    const product = Product.fromPayload(payload);
    const saved = await this.productRepository.create(product.toJSON());
    return saved;
  }
}
