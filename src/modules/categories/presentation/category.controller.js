import { BadRequestError, NotFoundError } from '../../../shared/errors/index.js';
import { sendSuccess } from '../../../shared/utils/response.js';
import { CategoryRepository } from '../infrastructure/CategoryRepository.js';

export class CategoryController {
  constructor({ listCategoriesUseCase, categoryRepository } = {}) {
    this.listCategoriesUseCase = listCategoriesUseCase;
    this.categoryRepository = categoryRepository || new CategoryRepository();
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

  create = async (req, res, next) => {
    try {
      const { name, type = 'video', icon, badge, description, status = 'active', display_order = 0 } = req.body || {};
      if (!name || typeof name !== 'string' || !name.trim()) {
        throw new BadRequestError('Category name is required.');
      }
      if (name.trim().length > 80) {
        throw new BadRequestError('Category name must be at most 80 characters.');
      }

      const created = await this.categoryRepository.create({
        name: name.trim(),
        type: type || 'video',
        icon: icon || (type === 'video' ? 'film' : 'sparkles'),
        badge: badge || null,
        description: typeof description === 'string' ? description.trim() : '',
        status: status === 'inactive' ? 'inactive' : 'active',
        display_order: Number.isFinite(Number(display_order)) ? Number(display_order) : 0,
      });

      return sendSuccess(res, created, 'Category created successfully', 201);
    } catch (error) {
      next(error);
    }
  };

  update = async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!id) {
        throw new BadRequestError('Category ID is required.');
      }
      const existing = await this.categoryRepository.findById(id);
      if (!existing) {
        throw new NotFoundError('Category not found.');
      }

      const updated = await this.categoryRepository.update(id, req.body || {});
      return sendSuccess(res, updated, 'Category updated successfully');
    } catch (error) {
      next(error);
    }
  };

  delete = async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!id) {
        throw new BadRequestError('Category ID is required.');
      }
      const existing = await this.categoryRepository.findById(id);
      if (!existing) {
        throw new NotFoundError('Category not found.');
      }

      const success = await this.categoryRepository.delete(id);
      return sendSuccess(res, { success: Boolean(success), id }, 'Category deleted successfully');
    } catch (error) {
      next(error);
    }
  };
}
