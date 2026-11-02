export class ListProductsUseCase {
  constructor({ productRepository }) {
    this.productRepository = productRepository;
  }

  async execute(options = {}) {
    return this.productRepository.list(options);
  }
}
