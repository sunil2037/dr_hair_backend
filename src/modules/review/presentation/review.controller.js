import { sendSuccess } from '../../../shared/utils/response.js';

export class ReviewController {
  constructor({ getReviewsUseCase, createReviewUseCase }) {
    this.getReviewsUseCase = getReviewsUseCase;
    this.createReviewUseCase = createReviewUseCase;
  }

  getReviews = async (req, res, next) => {
    try {
      const { review_type, status, page } = req.body || {};
      const data = await this.getReviewsUseCase.execute({
        review_type,
        status,
        page,
      });

      return sendSuccess(res, { data });
    } catch (err) {
      next(err);
    }
  };

  createReview = async (req, res, next) => {
    try {
      const { name, rating, category, message, avatar, review_type, page } = req.body;
      const data = await this.createReviewUseCase.execute({
        name,
        rating,
        category,
        message,
        avatar,
        review_type,
        page,
      });

      return sendSuccess(res, {
        message: 'Review created successfully.',
        data,
        statusCode: 201,
      });
    } catch (err) {
      next(err);
    }
  };
}

