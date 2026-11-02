import { NotFoundError } from '../../../shared/errors/index.js';

export class DeleteProductUseCase {
  constructor({ productRepository }) {
    this.productRepository = productRepository;
  }

  async execute({ id }) {
    if (!id) {
      throw new NotFoundError('Product ID is required.');
    }
    const existing = await this.productRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Product not found.');
    }
    const deleted = await this.productRepository.delete(id);
    return { success: deleted };
  }
}
