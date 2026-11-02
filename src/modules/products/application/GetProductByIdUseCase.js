import { NotFoundError } from '../../../shared/errors/index.js';

export class GetProductByIdUseCase {
  constructor({ productRepository }) {
    this.productRepository = productRepository;
  }

  async execute({ id }) {
    if (!id) {
      throw new NotFoundError('Product ID is required.');
    }
    const product = await this.productRepository.findById(id);
    if (!product) {
      throw new NotFoundError('Product not found.');
    }
    return product;
  }
}
