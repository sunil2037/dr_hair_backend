import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createContainer } from '../src/container.js';

describe('Review Module - Clean Architecture Tests', () => {
  const container = createContainer();
  const { getReviewsUseCase, createReviewUseCase } = container.useCases;

  it('should fetch active reviews for the home page', async () => {
    const reviews = await getReviewsUseCase.execute({
      review_type: 'doctor',
      status: 'active',
      page: 'home',
    });

    assert.ok(Array.isArray(reviews));
    assert.ok(reviews.length >= 1);
    assert.equal(reviews[0].name, 'Yashveer Soni');
    assert.equal(reviews[0].rating, 5);
    assert.equal(reviews[0].is_verified, true);
  });

  it('should create a new customer review', async () => {
    const newReview = await createReviewUseCase.execute({
      name: 'Amit Patel',
      rating: 5,
      category: 'Regrowth',
      message: 'Great results on my scalp after 90 days!',
    });

    assert.equal(newReview.name, 'Amit Patel');
    assert.equal(newReview.rating, 5);
    assert.equal(newReview.category, 'Regrowth');
  });
});

