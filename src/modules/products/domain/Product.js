import { BadRequestError } from '../../../shared/errors/index.js';

export class Product {
  constructor({
    id,
    name,
    subtitle = '',
    category,
    root_cause = 'Hair',
    root_causes = ['Hair'],
    sku = '',
    rating = 4.8,
    reviews_count = 0,
    in_stock = true,
    stock = 100,
    price,
    compare_at_price = 0,
    unit_cost = 0,
    status = 'active',
    images = [],
    media = [],
    supply_plans = [],
    benefits = [],
    ingredients = [],
    usage_steps = [],
    clinical_metrics = [],
    created_at,
    updated_at,
  }) {
    this.id = id;
    this.name = name;
    this.subtitle = subtitle;
    this.category = category;
    this.root_cause = root_cause;
    this.root_causes = Array.isArray(root_causes) && root_causes.length ? root_causes : [root_cause];
    this.sku = sku;
    this.rating = Number(rating) || 4.8;
    this.reviews_count = Number(reviews_count) || 0;
    this.in_stock = Boolean(in_stock);
    this.stock = Number(stock) || 0;
    this.price = Number(price);
    this.compare_at_price = Number(compare_at_price) || 0;
    this.unit_cost = Number(unit_cost) || 0;
    this.status = status;
    this.images = Array.isArray(images) ? images : [];
    this.media = Array.isArray(media) ? media : [];
    this.supply_plans = Array.isArray(supply_plans) ? supply_plans : [];
    this.benefits = Array.isArray(benefits) ? benefits : [];
    this.ingredients = Array.isArray(ingredients) ? ingredients : [];
    this.usage_steps = Array.isArray(usage_steps) ? usage_steps : [];
    this.clinical_metrics = Array.isArray(clinical_metrics) ? clinical_metrics : [];
    this.created_at = created_at || new Date().toISOString();
    this.updated_at = updated_at || new Date().toISOString();
  }

  static validate(data) {
    if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
      throw new BadRequestError('Product name is required.');
    }
    if (!data.category || typeof data.category !== 'string' || !data.category.trim()) {
      throw new BadRequestError('Product category is required.');
    }
    const price = Number(data.price);
    if (!Number.isFinite(price) || price <= 0) {
      throw new BadRequestError('Product price must be a positive number.');
    }
  }

  static fromPayload(payload, existingId = null) {
    const name = payload.name?.trim();
    const category = payload.category?.trim();
    const price = Number(payload.price ?? payload.supply_plans?.[0]?.price ?? payload.supplyPlans?.[0]?.price);
    Product.validate({ name, category, price });

    const rootCauses = Array.isArray(payload.root_causes)
      ? payload.root_causes
      : Array.isArray(payload.rootCauses)
      ? payload.rootCauses
      : [payload.root_cause || payload.rootCause || 'Hair'];

    const primaryRootCause = rootCauses[0] || 'Hair';

    const rawPlans = payload.supply_plans || payload.supplyPlans || [];
    const supplyPlans = Array.isArray(rawPlans) && rawPlans.length > 0
      ? rawPlans.map((plan, idx) => ({
          id: plan.id || `plan_${idx + 1}`,
          title: plan.title || `${idx + 1} Month`,
          subtitle: plan.subtitle || '',
          price: Number(plan.price) || price,
          mrp: Number(plan.mrp || plan.compareAtPrice) || Number(payload.compare_at_price || payload.compareAtPrice) || price,
          badge: plan.badge || '',
          sku: plan.sku || `${payload.sku || 'DRH'}-${idx + 1}`,
        }))
      : [
          {
            id: 'plan_1',
            title: '1 Month',
            subtitle: 'Standard Supply',
            price,
            mrp: Number(payload.compare_at_price || payload.compareAtPrice) || price,
            badge: '',
            sku: payload.sku || 'DRH-001',
          },
        ];

    const extractedImages = [];
    if (Array.isArray(payload.images)) {
      for (const img of payload.images) {
        if (typeof img === 'string' && (img.startsWith('http://') || img.startsWith('https://'))) {
          extractedImages.push(img.trim());
        }
      }
    }
    if (Array.isArray(payload.media)) {
      for (const m of payload.media) {
        const u = m?.url || m?.secure_url || m?.name;
        if (typeof u === 'string' && (u.startsWith('http://') || u.startsWith('https://')) && !extractedImages.includes(u.trim())) {
          extractedImages.push(u.trim());
        }
      }
    }
    const images = extractedImages.length > 0
      ? extractedImages
      : ['https://res.cloudinary.com/demo/image/upload/sample.jpg'];

    return new Product({
      id: existingId || payload.id || `prd-${Date.now()}`,
      name,
      subtitle: (payload.subtitle || payload.description || '').slice(0, 160),
      category,
      root_cause: primaryRootCause,
      root_causes: rootCauses,
      sku: payload.sku || `DRH-${Date.now().toString().slice(-4)}`,
      rating: Number(payload.rating) || 4.8,
      reviews_count: Number(payload.reviews_count || payload.reviewsCount) || 0,
      in_stock: payload.in_stock !== false && payload.inStock !== false && payload.status !== 'Draft',
      stock: Number(payload.stock ?? 100),
      price,
      compare_at_price: Number(payload.compare_at_price || payload.compareAtPrice) || supplyPlans[0]?.mrp || price,
      unit_cost: Number(payload.unit_cost || payload.unitCost) || 0,
      status: (payload.status || 'active').toLowerCase(),
      images,
      media: payload.media || images.map((url) => ({ name: url, kind: 'image' })),
      supply_plans: supplyPlans,
      benefits: payload.benefits || [],
      ingredients: payload.ingredients || [],
      usage_steps: payload.usage_steps || payload.usageSteps || [],
      clinical_metrics: payload.clinical_metrics || payload.clinicalMetrics || payload.clinicalClaims || [],
    });
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      subtitle: this.subtitle,
      description: this.subtitle,
      category: this.category,
      root_cause: this.root_cause,
      root_causes: this.root_causes,
      rootCause: this.root_cause,
      sku: this.sku,
      rating: this.rating,
      reviews_count: this.reviews_count,
      reviewsCount: this.reviews_count,
      in_stock: this.in_stock,
      inStock: this.in_stock,
      stock: this.stock,
      price: this.price,
      compare_at_price: this.compare_at_price,
      compareAtPrice: this.compare_at_price,
      unit_cost: this.unit_cost,
      status: this.status,
      images: this.images,
      media: this.media,
      supply_plans: this.supply_plans,
      supplyPlans: this.supply_plans,
      benefits: this.benefits,
      ingredients: this.ingredients,
      usage_steps: this.usage_steps,
      usageSteps: this.usage_steps,
      clinical_metrics: this.clinical_metrics,
      clinicalMetrics: this.clinical_metrics,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }
}
