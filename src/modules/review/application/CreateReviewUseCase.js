import { BadRequestError } from '../../../shared/errors/index.js';

export class CreateReviewUseCase {
  constructor({ reviewRepository }) {
    this.reviewRepository = reviewRepository;
  }

  async execute({ name, rating, category, message, avatar, review_type = 'doctor', page = 'home' }) {
    if (!name || !message) {
      throw new BadRequestError('Name and review message are required.');
    }

    const review = await this.reviewRepository.create({
      name,
      rating: Number(rating) || 5,
      category: category || 'Hair Treatment',
      message,
      avatar: avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde',
      is_verified: true,
      review_type,
      status: 'active',
      page,
    });

    return review.toPublicResponse();
  }
}

