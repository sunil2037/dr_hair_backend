import { sendSuccess } from '../../../shared/utils/response.js';

export class ProductController {
  constructor({
    listProductsUseCase,
    getProductByIdUseCase,
    createProductUseCase,
    updateProductUseCase,
    deleteProductUseCase,
  }) {
    this.listProductsUseCase = listProductsUseCase;
    this.getProductByIdUseCase = getProductByIdUseCase;
    this.createProductUseCase = createProductUseCase;
    this.updateProductUseCase = updateProductUseCase;
    this.deleteProductUseCase = deleteProductUseCase;
  }

  list = async (req, res, next) => {
    try {
      const {
        category,
        root_cause,
        rootCause,
        search,
        q,
        in_stock,
        inStock,
        status,
        page,
        limit,
      } = req.query;

      const result = await this.listProductsUseCase.execute({
        category,
        rootCause: root_cause || rootCause,
        search: search || q,
        inStock: in_stock !== undefined ? in_stock === 'true' : inStock !== undefined ? inStock === 'true' : undefined,
        status: status || 'active',
        page,
        limit,
      });

      return sendSuccess(res, {
        message: 'Products retrieved successfully.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  listAdmin = async (req, res, next) => {
    try {
      const {
        category,
        rootCause,
        search,
        status,
        page,
        limit,
      } = req.query;

      const result = await this.listProductsUseCase.execute({
        category,
        rootCause,
        search,
        status: status || 'all',
        page,
        limit,
      });

      return sendSuccess(res, {
        message: 'Admin products catalog retrieved successfully.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  getById = async (req, res, next) => {
    try {
      const { id } = req.params;
      const product = await this.getProductByIdUseCase.execute({ id });
      return sendSuccess(res, {
        message: 'Product retrieved successfully.',
        data: product,
      });
    } catch (error) {
      next(error);
    }
  };

  create = async (req, res, next) => {
    try {
      const product = await this.createProductUseCase.execute(req.body);
      return sendSuccess(res, {
        message: 'Product created successfully.',
        data: product,
        statusCode: 201,
      });
    } catch (error) {
      next(error);
    }
  };

  update = async (req, res, next) => {
    try {
      const { id } = req.params;
      const product = await this.updateProductUseCase.execute({ id, ...req.body });
      return sendSuccess(res, {
        message: 'Product updated successfully.',
        data: product,
      });
    } catch (error) {
      next(error);
    }
  };

  delete = async (req, res, next) => {
    try {
      const { id } = req.params;
      await this.deleteProductUseCase.execute({ id });
      return sendSuccess(res, {
        message: 'Product deleted successfully.',
      });
    } catch (error) {
      next(error);
    }
  };
}
