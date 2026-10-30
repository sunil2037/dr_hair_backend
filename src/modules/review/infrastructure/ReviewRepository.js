import { IReviewRepository } from '../domain/IReviewRepository.js';
import { Review } from '../domain/Review.js';
import { store } from '../../../shared/database/store.js';

export class ReviewRepository extends IReviewRepository {
  async findFiltered({ review_type, status, page } = {}) {
    let results = [...store.reviews];

    if (review_type) {
      results = results.filter((r) => !r.review_type || r.review_type === review_type);
    }

    if (status) {
      results = results.filter((r) => !r.status || r.status === status);
    }

    if (page) {
      results = results.filter((r) => !r.page || r.page === page);
    }

    return results.map((r) => new Review(r));
  }

  async create(reviewData) {
    const newId = store.reviews.length > 0 ? Math.max(...store.reviews.map((r) => r.id)) + 1 : 1;
    const newRecord = {
      ...reviewData,
      id: newId,
      created_at: new Date().toISOString(),
    };

    store.reviews.push(newRecord);
    return new Review(newRecord);
  }
}

