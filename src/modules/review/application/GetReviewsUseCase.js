export class GetReviewsUseCase {
  constructor({ reviewRepository }) {
    this.reviewRepository = reviewRepository;
  }

  async execute({ review_type = 'doctor', status = 'active', page = 'home' } = {}) {
    const reviews = await this.reviewRepository.findFiltered({
      review_type,
      status,
      page,
    });

    return reviews.map((r) => r.toPublicResponse());
  }
}

