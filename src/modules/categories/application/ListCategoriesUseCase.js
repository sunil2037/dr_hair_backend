import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { ProductModel, VideoModel } from '../../../shared/database/models.js';
import { store } from '../../../shared/database/store.js';

export class ListCategoriesUseCase {
  constructor({ productRepository, videoRepository } = {}) {
    this.productRepository = productRepository;
    this.videoRepository = videoRepository;
  }

  async execute({ type } = {}) {
    const productCounts = await this._getProductCounts();
    const videoCounts = await this._getVideoCounts();

    const productCategories = [
      {
        id: 'all',
        name: 'All',
        slug: 'all',
        type: 'product',
        icon: 'layout-grid',
        badge: null,
        description: 'All clinical hair care formulations',
        item_count: productCounts.total || 0,
      },
      {
        id: 'hair',
        name: 'Hair Fall & Regrowth',
        slug: 'hair',
        type: 'product',
        icon: 'sparkles',
        badge: 'Popular',
        description: 'Active follicular serums and growth complexes',
        item_count: productCounts.hair || 0,
      },
      {
        id: 'dandruff',
        name: 'Dandruff & Scalp',
        slug: 'dandruff',
        type: 'product',
        icon: 'shield-check',
        badge: null,
        description: 'Antifungal and purifying scalp cleansers',
        item_count: productCounts.dandruff || 0,
      },
      {
        id: 'gut',
        name: 'Gut Health',
        slug: 'gut',
        type: 'product',
        icon: 'apple',
        badge: null,
        description: 'Probiotics and digestive nutrient absorption',
        item_count: productCounts.gut || 0,
      },
      {
        id: 'stress',
        name: 'Stress & Sleep',
        slug: 'stress',
        type: 'product',
        icon: 'brain',
        badge: null,
        description: 'Cortisol regulation and calming herbal extracts',
        item_count: productCounts.stress || 0,
      },
      {
        id: 'thyroid',
        name: 'Thyroid Care',
        slug: 'thyroid',
        type: 'product',
        icon: 'activity',
        badge: null,
        description: 'Metabolic thyroid hormone support',
        item_count: productCounts.thyroid || 0,
      },
      {
        id: 'pcos',
        name: 'PCOS & Androgen',
        slug: 'pcos',
        type: 'product',
        icon: 'flower-2',
        badge: null,
        description: 'Hormonal balance and DHT control formulations',
        item_count: productCounts.pcos || 0,
      },
      {
        id: 'hormone',
        name: 'Hormone Balance',
        slug: 'hormone',
        type: 'product',
        icon: 'dna',
        badge: null,
        description: 'Endocrine stabilization for root-cause recovery',
        item_count: productCounts.hormone || 0,
      },
    ];

    const videoCategories = [
      {
        id: 'all',
        name: 'All Stories',
        slug: 'all',
        type: 'video',
        icon: 'film',
        item_count: videoCounts.total || 0,
      },
      {
        id: 'hair_fall',
        name: 'Hair Fall',
        slug: 'hair-fall',
        type: 'video',
        icon: 'sparkles',
        item_count: videoCounts.hair_fall || 0,
      },
      {
        id: 'regrowth',
        name: 'Regrowth',
        slug: 'regrowth',
        type: 'video',
        icon: 'trending-up',
        item_count: videoCounts.regrowth || 0,
      },
      {
        id: 'dandruff',
        name: 'Dandruff',
        slug: 'dandruff',
        type: 'video',
        icon: 'shield-check',
        item_count: videoCounts.dandruff || 0,
      },
      {
        id: 'doctor_advice',
        name: 'Doctor Advice',
        slug: 'doctor-advice',
        type: 'video',
        icon: 'stethoscope',
        item_count: videoCounts.doctor_advice || 0,
      },
    ];

    const serviceCategories = [
      {
        id: 'srv_assessment',
        name: 'AI Hair & Scalp Assessment',
        slug: 'assessment',
        type: 'service',
        icon: 'camera',
        price: 'Free',
        description: 'Evaluation of hair loss pattern and scalp health',
      },
      {
        id: 'srv_consultation',
        name: 'Trichologist Consultation',
        slug: 'consultation',
        type: 'service',
        icon: 'user-check',
        price: '₹500',
        description: 'One-on-one video or clinic consultation with certified specialists',
      },
      {
        id: 'srv_prp',
        name: 'PRP Hair Therapy',
        slug: 'prp',
        type: 'service',
        icon: 'syringe',
        price: '₹4,500',
        description: 'Platelet-Rich Plasma therapy designed to stimulate active and dormant follicles',
      },
      {
        id: 'srv_laser',
        name: 'Low-Level Light Therapy (LLLT)',
        slug: 'laser',
        type: 'service',
        icon: 'zap',
        price: '₹2,500',
        description: 'Clinical-grade light stimulation therapy for cellular repair',
      },
    ];

    const clinicalConcerns = [
      {
        id: 'thinning',
        name: 'Crown & Overall Thinning',
        slug: 'thinning',
        type: 'concern',
        icon: 'user',
        description: 'Progressive thinning with increased scalp visibility',
      },
      {
        id: 'receding',
        name: 'Receding Hairline & Temples',
        slug: 'receding',
        type: 'concern',
        icon: 'arrow-up-right',
        description: 'M-shaped hairline shift and temporal recession',
      },
      {
        id: 'dandruff_flakes',
        name: 'Flakes, Dandruff & Scalp Itch',
        slug: 'dandruff-flakes',
        type: 'concern',
        icon: 'shield-alert',
        description: 'Stubborn flakes, redness, or oily scalp build-up',
      },
      {
        id: 'patchy',
        name: 'Patchy Hair Loss',
        slug: 'patchy',
        type: 'concern',
        icon: 'circle-dot',
        description: 'Coin-shaped smooth patches (Alopecia Areata)',
      },
    ];

    const normalizedType = typeof type === 'string' ? type.trim().toLowerCase() : '';

    if (normalizedType === 'products' || normalizedType === 'product') {
      return { products: productCategories };
    }
    if (normalizedType === 'videos' || normalizedType === 'video') {
      return { videos: videoCategories };
    }
    if (normalizedType === 'services' || normalizedType === 'service') {
      return { services: serviceCategories };
    }
    if (normalizedType === 'concerns' || normalizedType === 'concern') {
      return { concerns: clinicalConcerns };
    }

    return {
      products: productCategories,
      videos: videoCategories,
      services: serviceCategories,
      concerns: clinicalConcerns,
    };
  }

  async _getProductCounts() {
    const counts = {
      total: 0,
      hair: 0,
      dandruff: 0,
      gut: 0,
      stress: 0,
      thyroid: 0,
      pcos: 0,
      hormone: 0,
    };

    try {
      if (isMongoConnected()) {
        const activeProducts = await ProductModel.find({ status: 'active' }).select('root_cause root_causes category name').lean();
        counts.total = activeProducts.length;

        for (const p of activeProducts) {
          const root = (p.root_cause || '').toLowerCase();
          const roots = Array.isArray(p.root_causes) ? p.root_causes.map((r) => String(r).toLowerCase()) : [];
          const cat = (p.category || '').toLowerCase();
          const name = (p.name || '').toLowerCase();

          if (root.includes('hair') || roots.some((r) => r.includes('hair')) || cat.includes('hair') || name.includes('serum')) counts.hair++;
          if (root.includes('dandruff') || roots.some((r) => r.includes('dandruff')) || cat.includes('dandruff') || cat.includes('cleanser')) counts.dandruff++;
          if (root.includes('gut') || roots.some((r) => r.includes('gut')) || cat.includes('gut') || cat.includes('digest')) counts.gut++;
          if (root.includes('stress') || roots.some((r) => r.includes('stress')) || cat.includes('stress') || cat.includes('calm')) counts.stress++;
          if (root.includes('thyroid') || roots.some((r) => r.includes('thyroid')) || cat.includes('thyroid') || cat.includes('metabol')) counts.thyroid++;
          if (root.includes('pcos') || roots.some((r) => r.includes('pcos')) || cat.includes('pcos')) counts.pcos++;
          if (root.includes('hormone') || roots.some((r) => r.includes('hormone')) || cat.includes('androgen') || cat.includes('dht')) counts.hormone++;
        }
        return counts;
      }

      // Memory store fallback
      const products = Array.isArray(store.products) ? store.products.filter((p) => p.status !== 'archived') : [];
      counts.total = products.length;

      for (const p of products) {
        const root = (p.root_cause || p.rootCause || '').toLowerCase();
        const roots = Array.isArray(p.root_causes) ? p.root_causes.map((r) => String(r).toLowerCase()) : [];
        const cat = (p.category || '').toLowerCase();
        const name = (p.name || '').toLowerCase();

        if (root.includes('hair') || roots.some((r) => r.includes('hair')) || cat.includes('hair') || name.includes('serum')) counts.hair++;
        if (root.includes('dandruff') || roots.some((r) => r.includes('dandruff')) || cat.includes('dandruff') || cat.includes('cleanser')) counts.dandruff++;
        if (root.includes('gut') || roots.some((r) => r.includes('gut')) || cat.includes('gut') || cat.includes('digest')) counts.gut++;
        if (root.includes('stress') || roots.some((r) => r.includes('stress')) || cat.includes('stress') || cat.includes('calm')) counts.stress++;
        if (root.includes('thyroid') || roots.some((r) => r.includes('thyroid')) || cat.includes('thyroid') || cat.includes('metabol')) counts.thyroid++;
        if (root.includes('pcos') || roots.some((r) => r.includes('pcos')) || cat.includes('pcos')) counts.pcos++;
        if (root.includes('hormone') || roots.some((r) => r.includes('hormone')) || cat.includes('androgen') || cat.includes('dht')) counts.hormone++;
      }
    } catch (_) {}

    return counts;
  }

  async _getVideoCounts() {
    const counts = {
      total: 0,
      hair_fall: 0,
      regrowth: 0,
      dandruff: 0,
      doctor_advice: 0,
    };

    try {
      if (isMongoConnected()) {
        const publishedVideos = await VideoModel.find({ status: 'published' }).select('category tag author_name').lean();
        counts.total = publishedVideos.length;

        for (const v of publishedVideos) {
          const cat = `${v.category || ''} ${v.tag || ''}`.toLowerCase();
          const author = (v.author_name || '').toLowerCase();

          if (cat.includes('hair fall')) counts.hair_fall++;
          if (cat.includes('regrowth')) counts.regrowth++;
          if (cat.includes('dandruff')) counts.dandruff++;
          if (cat.includes('doctor') || author.includes('dr.')) counts.doctor_advice++;
        }
        return counts;
      }

      // Memory store fallback
      const videos = Array.isArray(store.videos) ? store.videos.filter((v) => v.status === 'published') : [];
      counts.total = videos.length;

      for (const v of videos) {
        const cat = `${v.category || ''} ${v.tag || ''}`.toLowerCase();
        const author = (v.author_name || '').toLowerCase();

        if (cat.includes('hair fall')) counts.hair_fall++;
        if (cat.includes('regrowth')) counts.regrowth++;
        if (cat.includes('dandruff')) counts.dandruff++;
        if (cat.includes('doctor') || author.includes('dr.')) counts.doctor_advice++;
      }
    } catch (_) {}

    return counts;
  }
}

