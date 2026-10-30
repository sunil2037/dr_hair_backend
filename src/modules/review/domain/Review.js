/**
 * Review Domain Entity
 */
export class Review {
  constructor({
    id,
    name,
    rating,
    category,
    message,
    avatar,
    is_verified = true,
    review_type = 'doctor',
    status = 'active',
    page = 'home',
    created_at = new Date().toISOString(),
  }) {
    this.id = id;
    this.name = name;
    this.rating = Number(rating);
    this.category = category;
    this.message = message;
    this.avatar = avatar;
    this.is_verified = Boolean(is_verified);
    this.review_type = review_type;
    this.status = status;
    this.page = page;
    this.created_at = created_at;
  }

  toPublicResponse() {
    return {
      id: this.id,
      name: this.name,
      rating: this.rating,
      category: this.category,
      message: this.message,
      avatar: this.avatar,
      is_verified: this.is_verified,
    };
  }
}

