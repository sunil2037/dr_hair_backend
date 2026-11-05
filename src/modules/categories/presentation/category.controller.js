import { sendSuccess } from '../../../shared/utils/response.js';

export class CategoryController {
  constructor({ listCategoriesUseCase }) {
    this.listCategoriesUseCase = listCategoriesUseCase;
  }

  list = async (req, res, next) => {
    try {
      const { type } = req.query;
      const data = await this.listCategoriesUseCase.execute({ type });
      return sendSuccess(res, data, 'Categories retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  listProducts = async (req, res, next) => {
    try {
      const result = await this.listCategoriesUseCase.execute({ type: 'products' });
      return sendSuccess(res, result.products || [], 'Product categories retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  listVideos = async (req, res, next) => {
    try {
      const result = await this.listCategoriesUseCase.execute({ type: 'videos' });
      return sendSuccess(res, result.videos || [], 'Video categories retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  listServices = async (req, res, next) => {
    try {
      const result = await this.listCategoriesUseCase.execute({ type: 'services' });
      return sendSuccess(res, result.services || [], 'Service categories retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  listConcerns = async (req, res, next) => {
    try {
      const result = await this.listCategoriesUseCase.execute({ type: 'concerns' });
      return sendSuccess(res, result.concerns || [], 'Clinical concern categories retrieved successfully');
    } catch (error) {
      next(error);
    }
  };
}

