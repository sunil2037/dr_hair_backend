const clean = (value) => String(value || '').trim().toLowerCase();

const availableProduct = (product = {}) => {
  const status = clean(product.status);
  const stock = Number(product.stock);
  const inStock = product.in_stock ?? product.inStock;
  const safetyText = `${clean(product.name)} ${clean(product.category)}`;
  return status === 'active' && inStock === true && Number.isFinite(stock) && stock > 0 &&
    !/\b(supplement|medicine|medication|prescription|minoxidil|drug)\b/.test(safetyText);
};

const matchesTarget = (product, target) => {
  const category = clean(product.category);
  const name = clean(product.name);
  const normalizedTarget = clean(target?.category);
  if (!normalizedTarget) return false;
  if (category && (category.includes(normalizedTarget) || normalizedTarget.includes(category))) return true;
  if (normalizedTarget.includes('serum')) return name.includes('serum');
  if (normalizedTarget.includes('hair care')) {
    return category.includes('hair') || /shampoo|cleanser|hair care/.test(name);
  }
  if (normalizedTarget.includes('supplement')) return category.includes('supplement') || name.includes('supplement');
  return name.includes(normalizedTarget);
};

/** Resolves AI product categories against the live, patient-visible catalog. */
export class AssessmentProductAvailabilityService {
  constructor({ productRepository, featureFlagRepository } = {}) {
    this.productRepository = productRepository;
    this.featureFlagRepository = featureFlagRepository;
  }

  async resolve(aiAssessment) {
    const result = {
      ...aiAssessment,
      available_products: [],
      product_availability: { status: 'checked', shop_enabled: false },
    };
    if (!aiAssessment || !this.featureFlagRepository || !this.productRepository) return result;
    if (aiAssessment.next_step_recommendation?.type === 'doctor_appointment') {
      result.product_availability.status = 'not_applicable';
      return result;
    }

    try {
      const flag = await this.featureFlagRepository.evaluate('shop', { platform: 'patient' });
      if (!flag?.enabled) return result;
      result.product_availability.shop_enabled = true;

      const targets = aiAssessment.recommended_regimen?.target_products;
      if (!Array.isArray(targets) || targets.length === 0) return result;

      let timeoutId;
      let catalog;
      try {
        catalog = await Promise.race([
          this.productRepository.list({
            status: 'active',
            inStock: true,
            page: 1,
            limit: 100,
          }),
          new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Product lookup timed out.')), 1200);
          }),
        ]);
      } finally {
        clearTimeout(timeoutId);
      }
      const products = Array.isArray(catalog?.items) ? catalog.items : [];
      const selected = [];
      for (const target of targets) {
        if (/\b(supplement|medicine|medication|prescription|drug)\b/.test(clean(target?.category))) continue;
        const match = products.find((product) => availableProduct(product) && matchesTarget(product, target));
        if (!match || selected.some((product) => String(product.id) === String(match.id))) continue;
        selected.push({
          id: match.id,
          name: match.name,
          subtitle: match.subtitle || '',
          category: match.category,
          root_cause: match.root_cause || 'Hair',
          rating: match.rating,
          reviews_count: match.reviews_count,
          in_stock: true,
          stock: Number(match.stock),
          price: match.price,
          compare_at_price: match.compare_at_price,
          images: match.images || [],
          media: match.media || [],
          supply_plans: match.supply_plans || [],
          benefits: match.benefits || [],
          ingredients: match.ingredients || [],
          usage_steps: match.usage_steps || [],
          clinical_metrics: match.clinical_metrics || [],
        });
        if (selected.length >= 3) break;
      }
      result.available_products = selected;
      return result;
    } catch {
      // Product inventory is optional; a catalog outage must not block the clinical report.
      result.product_availability.status = 'unavailable';
      result.available_products = [];
      return result;
    }
  }
}
