import mongoose from 'mongoose';

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    patient_code: { type: String, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    phoneNormalized: { type: String, trim: true, sparse: true, unique: true },
    passwordHash: { type: String, default: null, select: false },
    authProviders: { type: [String], default: ['password'] },
    googleId: { type: String, trim: true, sparse: true },
    appleId: { type: String, trim: true, sparse: true },
    age: { type: Number, default: null },
    gender: { type: String, default: null },
    city: { type: String, default: null },
    occupation: { type: String, default: null },
    platform: { type: String, default: 'app' },
    profile_url: { type: String, default: null },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    status: { type: String, enum: ['active', 'blocked', 'deleted'], default: 'active', index: true },
    is_blocked: { type: Boolean, default: false, index: true },
    blocked_at: { type: Date, default: null },
    blocked_reason: { type: String, default: null },
    last_login_at: { type: Date, default: null },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { collection: 'users', strict: false, versionKey: false },
);
userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ patient_code: 1 }, { unique: true, sparse: true });
userSchema.index({ googleId: 1 }, { unique: true, sparse: true });
userSchema.index({ appleId: 1 }, { unique: true, sparse: true });
userSchema.index({ role: 1, created_at: -1, id: -1 });

const adminAccountSchema = new Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin', 'super_admin'], default: 'admin', required: true },
    roleTemplate: { type: String, default: 'clinical-admin' },
    permissions: { type: [String], default: [] },
    permissionOverrides: { type: Schema.Types.Mixed, default: {} },
    active: { type: Boolean, default: true, index: true },
    suspendedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { collection: 'admin_accounts', versionKey: false },
);

const otpSchema = new Schema(
  {
    login: { type: String, required: true, unique: true, index: true },
    otpHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true, expires: 0 },
    attempts: { type: Number, default: 0, min: 0 },
    type: { type: String, enum: ['login', 'register', 'signup_verification', 'password_reset'], default: 'login' },
  },
  { collection: 'otps', versionKey: false },
);

const hairTestStatusHistorySchema = new Schema(
  {
    status: { type: String, required: true },
    changed_at: { type: Date, default: Date.now },
    changed_by: { type: String, default: '' },
    note: { type: String, default: '' },
  },
  { _id: false },
);

const hairTestSchema = new Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    userId: { type: Number, index: true, default: null },
    reference_no: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ['draft', 'submitted', 'under_review', 'reviewed', 'archived'],
      default: 'submitted',
      index: true,
    },
    status_history: { type: [hairTestStatusHistorySchema], default: [] },
    created_at: { type: String, default: () => new Date().toISOString() },
  },
  { collection: 'hair_tests', strict: false, versionKey: false },
);

const hairTestDraftSchema = new Schema(
  {
    userId: { type: Number, required: true, unique: true, index: true },
    formData: { type: Schema.Types.Mixed, default: {} },
    step: { type: Number, default: 0 },
    updated_at: { type: Date, default: Date.now },
  },
  { collection: 'hair_test_drafts', versionKey: false },
);

const prescribedMedicationSchema = new Schema(
  {
    catalog_id: { type: String, default: '' },
    name: { type: String, required: true, trim: true },
    category: { type: String, default: '', trim: true },
    form: { type: String, default: '', trim: true },
    dose: { type: String, required: true, trim: true },
    frequency: { type: String, required: true, trim: true },
    duration: { type: String, default: '', trim: true },
    instructions: { type: String, default: '', trim: true },
  },
  { _id: false, strict: true },
);

const careRoutineStepSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, default: '', trim: true },
    category: { type: String, default: '', trim: true },
    time_of_day: { type: String, default: '', trim: true },
  },
  { _id: false, strict: true },
);

const dietMealSchema = new Schema(
  {
    type: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    nutrients: { type: String, default: '', trim: true },
    benefit: { type: String, default: '', trim: true },
  },
  { _id: false, strict: true },
);

const careReminderSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, default: '', trim: true },
    time: { type: String, default: '20:00' },
    hour: { type: Number, default: 20 },
    minute: { type: Number, default: 0 },
    isEnabled: { type: Boolean, default: true },
    frequency: { type: String, default: 'Daily' },
    treatmentType: { type: String, default: 'Topical Serum' },
    repeatDays: { type: [Number], default: [1, 2, 3, 4, 5, 6, 7] },
    isCompleted: { type: Boolean, default: false },
    notes: { type: String, default: '', trim: true },
    snoozedUntil: { type: Date, default: null },
  },
  { _id: false, strict: false },
);

const treatmentSchema = new Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    test_id: { type: Number, index: true },
    reference_no: { type: String, index: true },
    userId: { type: Number, index: true },
    treatment_name: { type: String, required: true, trim: true },
    duration: { type: String, default: '' },
    instructions: { type: String, default: '' },
    doctor_name: { type: String, default: '' },
    medications: { type: [prescribedMedicationSchema], default: [] },
    diagnosis: { type: String, default: '', trim: true },
    stage: { type: String, default: '', trim: true },
    next_review_date: { type: String, default: '' },
    routine_steps: { type: [careRoutineStepSchema], default: [] },
    diet_meals: { type: [dietMealSchema], default: [] },
    care_reminders: { type: [careReminderSchema], default: [] },
    date: { type: String, default: () => new Date().toISOString().slice(0, 10) },
  },
  { collection: 'treatments', strict: false, versionKey: false },
);

const reportVisibilityEventSchema = new Schema(
  {
    action: { type: String, enum: ['uploaded', 'shared', 'hidden', 'archived', 'restored'], required: true },
    visibility: { type: String, enum: ['Private', 'Shared'], required: true },
    changed_by: { type: String, default: '' },
    changed_at: { type: Date, default: Date.now },
    patient_consent_confirmed: { type: Boolean, default: false },
  },
  { _id: false, strict: true },
);

const clinicalReportSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: Number, required: true, index: true },
    title: { type: String, required: true, trim: true },
    file_name: { type: String, required: true },
    mime_type: { type: String, required: true },
    format: { type: String, required: true },
    bytes: { type: Number, required: true },
    public_id: { type: String, required: true, unique: true },
    uploaded_by: { type: String, default: '' },
    visibility: { type: String, enum: ['Private', 'Shared'], default: 'Private' },
    shared_at: { type: Date, default: null },
    visibility_history: { type: [reportVisibilityEventSchema], default: [] },
    deleted_at: { type: Date, default: null, index: true },
    purge_after: { type: Date, default: null, index: true },
    deleted_by: { type: String, default: '' },
    created_at: { type: Date, default: Date.now },
  },
  { collection: 'clinical_reports', versionKey: false },
);
clinicalReportSchema.index({ userId: 1, created_at: -1 });
clinicalReportSchema.index({ userId: 1, visibility: 1, created_at: -1 });
clinicalReportSchema.index({ deleted_at: 1, purge_after: 1 });

const appointmentHistorySchema = new Schema(
  {
    action: { type: String, required: true, trim: true },
    status: { type: String, required: true, trim: true },
    changed_by: { type: String, default: '' },
    changed_at: { type: Date, default: Date.now },
    starts_at: { type: String, default: '' },
  },
  { _id: false, strict: true },
);

const appointmentSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: Number, required: true, index: true },
    patient_code: { type: String, default: '' },
    starts_at: { type: String, required: true, index: true },
    slot_key: { type: String, sparse: true, unique: true },
    reason: { type: String, default: '' },
    source: { type: String, enum: ['App', 'Phone', 'WhatsApp', 'Reception'], default: 'App' },
    status: { type: String, enum: ['Requested', 'Confirmed', 'Arrived', 'In Consultation', 'Completed', 'Cancelled', 'No show'], default: 'Requested', index: true },
    type: { type: String, default: 'Physical Clinic Visit' },
    doctor_name: { type: String, default: 'Dr. Jai Bansal' },
    room: { type: String, default: 'Room 101 - Chamber A' },
    opd_token: { type: String, default: '' },
    consultation_fee: { type: Number, default: 500 },
    payment_status: { type: String, enum: ['Pending', 'Paid', 'Refunded', 'Waived'], default: 'Pending', index: true },
    payment_method: { type: String, default: 'UPI' },
    payment_transaction_id: { type: String, default: '' },
    payment_time: { type: Date, default: null },
    status_history: { type: [appointmentHistorySchema], default: [] },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { collection: 'clinic_appointments', versionKey: false },
);
appointmentSchema.index({ userId: 1, starts_at: -1 });
appointmentSchema.index({ starts_at: 1, status: 1 });

const clinicClosedDateSchema = new Schema(
  {
    date: { type: String, required: true, unique: true, index: true },
    reason: { type: String, default: '' },
    created_by: { type: String, default: '' },
    created_at: { type: Date, default: Date.now },
  },
  { collection: 'clinic_closed_dates', versionKey: false },
);

const patientActivitySchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: Number, required: true, index: true },
    patient_code: { type: String, default: '' },
    type: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    summary: { type: String, default: '', trim: true },
    actor: { type: String, default: 'Clinic' },
    occurred_at: { type: Date, default: Date.now, index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { collection: 'patient_activity', versionKey: false },
);
patientActivitySchema.index({ userId: 1, occurred_at: -1 });

const progressPhotoSchema = new Schema(
  {
    angle: { type: String, enum: ['front', 'top', 'back'], required: true },
    public_id: { type: String, required: true },
    url: { type: String, required: true },
    delivery_type: { type: String, enum: ['upload', 'authenticated'], default: 'upload' },
    format: { type: String, default: '' },
    file_name: { type: String, default: '' },
    mime_type: { type: String, default: 'image/jpeg' },
    bytes: { type: Number, default: 0 },
  },
  { _id: false, strict: true },
);

const progressCheckInSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: Number, required: true, index: true },
    patient_code: { type: String, default: '' },
    date: { type: Date, required: true, index: true },
    scalp_region: { type: String, default: 'Scalp' },
    shedding_level: { type: String, default: 'Not recorded' },
    notes: { type: String, default: '' },
    density_rating: { type: Number, min: 1, max: 5, default: 3 },
    is_doctor_reviewed: { type: Boolean, default: false },
    doctor_note: { type: String, default: '' },
    photos: { type: [progressPhotoSchema], default: [] },
    created_at: { type: Date, default: Date.now },
  },
  { collection: 'patient_progress_checkins', versionKey: false },
);
progressCheckInSchema.index({ userId: 1, date: -1 });

const reviewSchema = new Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    rating: { type: Number, min: 1, max: 5, default: 5 },
    category: { type: String, default: 'Hair Treatment' },
    message: { type: String, required: true },
    avatar: { type: String, default: '' },
    is_verified: { type: Boolean, default: false },
    review_type: { type: String, default: 'doctor', index: true },
    status: { type: String, default: 'pending', index: true },
    page: { type: String, default: 'home', index: true },
    created_at: { type: Date, default: Date.now },
  },
  { collection: 'reviews', strict: false, versionKey: false },
);

const deviceTokenSchema = new Schema(
  {
    userId: { type: Number, required: false, default: null, index: true },
    token: { type: String, required: true, unique: true },
    platform: { type: String, enum: ['android', 'ios', 'web'], required: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { collection: 'device_tokens', versionKey: false },
);

const notificationSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: Number, index: true, default: null },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['appointment', 'order', 'product', 'treatment', 'reminder', 'announcement', 'general'],
      default: 'general',
      index: true,
    },
    destination: {
      type: { type: String, default: 'screen' },
      screen: { type: String, default: null },
      entityId: { type: String, default: null },
    },
    data: { type: Schema.Types.Mixed, default: {} },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
    created_at: { type: Date, default: Date.now, index: true },
  },
  { collection: 'notifications', versionKey: false },
);

const videoSchema = new Schema(
  {
    public_id: { type: String, required: true, unique: true, index: true },
    provider: { type: String, enum: ['cloudinary', 'youtube'], default: 'cloudinary' },
    youtube_video_id: { type: String, sparse: true, unique: true },
    title: { type: String, required: true, trim: true },
    category: { type: String, default: 'Hair Care', trim: true },
    tag: { type: String, default: 'Hair Care', trim: true },
    description: { type: String, default: '' },
    author_name: { type: String, default: 'Dr. Hair Patient' },
    author_handle: { type: String, default: '@drhair.patient' },
    avatar_url: { type: String, default: '' },
    treatment: { type: String, default: 'Clinical Hair Care Protocol' },
    placement: { type: String, enum: ['home', 'reels', 'both'], default: 'reels', index: true },
    secure_url: { type: String, required: true },
    thumbnail_url: { type: String, default: '' },
    duration: { type: Schema.Types.Mixed, default: null },
    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    comments_count: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    status: { type: String, enum: ['draft', 'published', 'hidden'], default: 'draft', index: true },
    created_by: { type: Number, default: null },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { collection: 'videos', versionKey: false },
);

const counterSchema = new Schema(
  { _id: String, seq: { type: Number, default: 0 } },
  { collection: 'counters', versionKey: false },
);

const rateLimitCounterSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    totalHits: { type: Number, required: true, default: 0 },
    resetTime: { type: Date, required: true },
  },
  { collection: 'rate_limit_counters', versionKey: false },
);
rateLimitCounterSchema.index({ resetTime: 1 }, { expireAfterSeconds: 0 });

const productSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    subtitle: { type: String, default: '', trim: true },
    category: { type: String, required: true, trim: true },
    root_cause: { type: String, default: 'Hair', trim: true },
    root_causes: { type: [String], default: ['Hair'] },
    sku: { type: String, default: '', trim: true },
    rating: { type: Number, default: 4.8 },
    reviews_count: { type: Number, default: 0 },
    in_stock: { type: Boolean, default: true },
    stock: { type: Number, default: 100 },
    price: { type: Number, required: true },
    compare_at_price: { type: Number, default: 0 },
    unit_cost: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'draft', 'archived'], default: 'active' },
    images: { type: [String], default: [] },
    media: { type: [Schema.Types.Mixed], default: [] },
    supply_plans: { type: [Schema.Types.Mixed], default: [] },
    benefits: { type: [Schema.Types.Mixed], default: [] },
    ingredients: { type: [Schema.Types.Mixed], default: [] },
    usage_steps: { type: [Schema.Types.Mixed], default: [] },
    clinical_metrics: { type: [Schema.Types.Mixed], default: [] },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { collection: 'products', strict: false, versionKey: false },
);
productSchema.index({ category: 1, root_cause: 1 });
productSchema.index({ status: 1, created_at: -1 });

const cartSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    items: { type: [Schema.Types.Mixed], default: [] },
    coupon_code: { type: String, default: null },
    discount: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { collection: 'carts', strict: false, versionKey: false },
);

const addressSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    house_number: { type: String, required: true, trim: true },
    street: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, trim: true },
    tag: { type: String, enum: ['Home', 'Work', 'Other'], default: 'Home' },
    is_default: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { collection: 'addresses', strict: false, versionKey: false },
);
addressSchema.index({ userId: 1, is_default: 1 });

const inventoryLedgerSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    product_id: { type: String, required: true, index: true },
    quantity: { type: Number, required: true },
    balance_after: { type: Number, required: true },
    reference_type: {
      type: String,
      enum: ['RESTOCK', 'RESERVATION', 'RELEASE', 'FULFILLMENT', 'RETURN_RESTOCK', 'ADJUSTMENT'],
      required: true,
      index: true,
    },
    reference_id: { type: String, default: '', index: true },
    notes: { type: String, default: '' },
    created_by: { type: String, default: 'system' },
    created_at: { type: Date, default: Date.now },
  },
  { collection: 'inventory_ledgers', strict: false, versionKey: false },
);
inventoryLedgerSchema.index({ product_id: 1, created_at: -1 });

const orderItemSnapshotSchema = new Schema(
  {
    product_id: { type: String, required: true },
    title: { type: String, required: true },
    subtitle: { type: String, default: '' },
    price: { type: Number, required: true },
    mrp: { type: Number, default: 0 },
    quantity: { type: Number, required: true, min: 1 },
    plan: { type: String, default: 'Standard' },
    image_url: { type: String, default: '' },
    subtotal: { type: Number, required: true },
  },
  { _id: false },
);

const orderAddressSnapshotSchema = new Schema(
  {
    id: { type: String, default: '' },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    house_number: { type: String, required: true },
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    tag: { type: String, default: 'Home' },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    order_id: { type: String, required: true, unique: true, index: true },
    idempotency_key: { type: String, index: true, sparse: true },
    user_id: { type: String, required: true, index: true },
    customer: {
      name: { type: String, default: '' },
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
    },
    items: { type: [orderItemSnapshotSchema], required: true },
    shipping_address: { type: orderAddressSnapshotSchema, required: true },
    pricing: {
      subtotal: { type: Number, required: true },
      discount: { type: Number, default: 0 },
      coupon_code: { type: String, default: null },
      delivery_fee: { type: Number, default: 0 },
      tax: { type: Number, default: 0 },
      total: { type: Number, required: true },
    },
    payment: {
      gateway: { type: String, enum: ['razorpay', 'cod', 'pay_at_clinic'], default: 'razorpay' },
      payment_status: {
        type: String,
        enum: ['Pending', 'Paid', 'Failed', 'Refunded', 'Partially refunded'],
        default: 'Pending',
        index: true,
      },
      payment_intent_id: { type: String, default: null, index: true },
      transaction_id: { type: String, default: null },
      payment_signature: { type: String, default: null },
      paid_at: { type: Date, default: null },
      refund_id: { type: String, default: null },
      refund_amount: { type: Number, default: 0 },
      refunded_at: { type: Date, default: null },
    },
    fulfillment: {
      status: {
        type: String,
        enum: ['New', 'Preparing', 'Shipped', 'Delivered', 'Cancelled', 'Return requested', 'Refunded'],
        default: 'New',
        index: true,
      },
      courier: { type: String, default: '' },
      tracking_number: { type: String, default: '' },
      shipped_at: { type: Date, default: null },
      delivered_at: { type: Date, default: null },
      cancellation_reason: { type: String, default: null },
      cancelled_at: { type: Date, default: null },
      return_reason: { type: String, default: null },
      returned_at: { type: Date, default: null },
    },
    timeline: {
      type: [
        {
          label: { type: String, required: true },
          timestamp: { type: Date, default: Date.now },
          done: { type: Boolean, default: true },
        },
      ],
      default: [],
    },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { collection: 'orders', strict: false, versionKey: false },
);
orderSchema.index({ user_id: 1, created_at: -1 });
orderSchema.index({ 'fulfillment.status': 1, created_at: -1 });
orderSchema.index({ 'payment.payment_status': 1, created_at: -1 });

const sessionSchema = new Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    userType: { type: String, enum: ['patient', 'admin', 'super_admin'], default: 'patient', index: true },
    refreshTokenHash: { type: String, required: true, index: true },
    deviceMetadata: {
      platform: { type: String, default: 'unknown' },
      userAgent: { type: String, default: '' },
      ip: { type: String, default: '' },
      deviceId: { type: String, default: '' },
    },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null, index: true },
    revokedReason: { type: String, default: null },
    rotatedAt: { type: Date, default: null },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { collection: 'auth_sessions', versionKey: false },
);
sessionSchema.index({ userId: 1, revokedAt: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const auditEventSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    actorId: { type: String, required: true, index: true },
    actorName: { type: String, default: '' },
    actorEmail: { type: String, default: '' },
    actorRole: { type: String, default: 'admin' },
    target: { type: String, required: true, index: true },
    targetType: { type: String, default: '' },
    action: { type: String, required: true, index: true },
    details: { type: Schema.Types.Mixed, default: {} },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    created_at: { type: Date, default: Date.now, index: true },
  },
  { collection: 'audit_events', versionKey: false },
);
auditEventSchema.index({ created_at: -1, action: 1 });

const notificationCampaignSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    audience: {
      type: String,
      enum: ['All app users', 'Active patients', 'Patients with a shared report', 'Custom'],
      default: 'All app users',
      index: true,
    },
    destination: {
      type: { type: String, default: 'screen' },
      screen: { type: String, default: 'home' },
      entityId: { type: String, default: null },
    },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'processing', 'sent', 'partial', 'failed', 'cancelled'],
      default: 'draft',
      index: true,
    },
    scheduledAt: { type: Date, default: null, index: true },
    sentAt: { type: Date, default: null },
    targetCount: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    createdBy: { type: String, default: 'Super Admin' },
    errorMessage: { type: String, default: null },
    created_at: { type: Date, default: Date.now, index: true },
    updated_at: { type: Date, default: Date.now },
  },
  { collection: 'notification_campaigns', versionKey: false },
);
notificationCampaignSchema.index({ status: 1, scheduledAt: 1 });

const contentItemSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    type: {
      type: String,
      enum: ['banner', 'faq', 'tip', 'story', 'home_placement'],
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, default: '' },
    content: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    actionUrl: { type: String, default: '' },
    placement: {
      type: String,
      enum: ['home', 'reels', 'care', 'explore', 'all'],
      default: 'home',
      index: true,
    },
    status: {
      type: String,
      enum: ['draft', 'review', 'published', 'hidden', 'archived'],
      default: 'draft',
      index: true,
    },
    provenance: {
      consent_verified: { type: Boolean, default: false },
      consent_reference: { type: String, default: '' },
      source: { type: String, default: '' },
      approved_by: { type: String, default: '' },
      evidence_note: { type: String, default: '' },
      approved_at: { type: Date, default: null },
    },
    sortOrder: { type: Number, default: 0, index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    created_at: { type: Date, default: Date.now, index: true },
    updated_at: { type: Date, default: Date.now },
  },
  { collection: 'content_items', versionKey: false },
);
contentItemSchema.index({ type: 1, placement: 1, status: 1, sortOrder: 1 });

const featureFlagSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    group: { type: String, default: 'Core Experience' },
    enabled: { type: Boolean, default: true, index: true },
    platform: { type: String, enum: ['all', 'app', 'panel', 'ios', 'android', 'web'], default: 'all' },
    rolloutPercentage: { type: Number, default: 100, min: 0, max: 100 },
    effectiveDate: { type: Date, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    updatedBy: { type: String, default: 'Super Admin' },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { collection: 'feature_flags', versionKey: false },
);

const appReleasePolicySchema = new Schema(
  {
    platform: { type: String, required: true, unique: true, index: true, enum: ['ios', 'android', 'all'] },
    minVersion: { type: String, required: true, default: '1.0.0' },
    latestVersion: { type: String, required: true, default: '1.0.0' },
    forceUpdate: { type: Boolean, default: false },
    maintenanceMode: { type: Boolean, default: false },
    maintenanceMessage: { type: String, default: 'Dr. Hair is undergoing routine clinical maintenance.' },
    releaseNotes: { type: String, default: '' },
    downloadUrl: { type: String, default: '' },
    updatedBy: { type: String, default: 'Super Admin' },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { collection: 'app_release_policies', versionKey: false },
);

const supportInquirySchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    user_id: { type: Number, default: null, index: true },
    status: { type: String, enum: ['pending', 'contacted', 'resolved'], default: 'pending', index: true },
    admin_notes: { type: String, default: null },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { collection: 'support_inquiries', versionKey: false },
);

const couponSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    discount_type: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
    discount_value: { type: Number, required: true, min: 0 },
    applies_to: { type: String, default: 'All products' },
    minimum_order: { type: Number, default: 0 },
    uses: { type: Number, default: 0 },
    max_uses: { type: Number, default: 1000 },
    expires_on: { type: String, default: '' },
    status: { type: String, enum: ['Active', 'Scheduled', 'Expired', 'Disabled'], default: 'Active', index: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { collection: 'coupons', versionKey: false },
);

const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    type: { type: String, required: true, enum: ['video', 'product', 'service', 'concern'], default: 'video' },
    icon: { type: String, default: 'film', trim: true },
    badge: { type: String, default: null, trim: true },
    description: { type: String, default: '', trim: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    display_order: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { collection: 'categories', versionKey: false },
);
categorySchema.index({ type: 1, status: 1 });
categorySchema.index({ slug: 1, type: 1 });

export const UserModel = mongoose.models.DrHairUser || mongoose.model('DrHairUser', userSchema);
export const AdminAccountModel = mongoose.models.DrHairAdminAccount || mongoose.model('DrHairAdminAccount', adminAccountSchema);
export const OtpModel = mongoose.models.DrHairOtp || mongoose.model('DrHairOtp', otpSchema);
export const SupportInquiryModel = mongoose.models.DrHairSupportInquiry || mongoose.model('DrHairSupportInquiry', supportInquirySchema);
export const CouponModel = mongoose.models.DrHairCoupon || mongoose.model('DrHairCoupon', couponSchema);
export const CategoryModel = mongoose.models.DrHairCategory || mongoose.model('DrHairCategory', categorySchema);
export const HairTestModel = mongoose.models.DrHairHairTest || mongoose.model('DrHairHairTest', hairTestSchema);
export const HairTestDraftModel = mongoose.models.DrHairHairTestDraft || mongoose.model('DrHairHairTestDraft', hairTestDraftSchema);
export const TreatmentModel = mongoose.models.DrHairTreatment || mongoose.model('DrHairTreatment', treatmentSchema);
export const ClinicalReportModel = mongoose.models.DrHairClinicalReport || mongoose.model('DrHairClinicalReport', clinicalReportSchema);
export const AppointmentModel = mongoose.models.DrHairAppointment || mongoose.model('DrHairAppointment', appointmentSchema);
export const ClinicClosedDateModel = mongoose.models.DrHairClinicClosedDate || mongoose.model('DrHairClinicClosedDate', clinicClosedDateSchema);
export const PatientActivityModel = mongoose.models.DrHairPatientActivity || mongoose.model('DrHairPatientActivity', patientActivitySchema);
export const ProgressCheckInModel = mongoose.models.DrHairProgressCheckIn || mongoose.model('DrHairProgressCheckIn', progressCheckInSchema);
export const ReviewModel = mongoose.models.DrHairReview || mongoose.model('DrHairReview', reviewSchema);
export const DeviceTokenModel = mongoose.models.DrHairDeviceToken || mongoose.model('DrHairDeviceToken', deviceTokenSchema);
export const NotificationModel = mongoose.models.DrHairNotification || mongoose.model('DrHairNotification', notificationSchema);
export const NotificationCampaignModel = mongoose.models.DrHairNotificationCampaign || mongoose.model('DrHairNotificationCampaign', notificationCampaignSchema);
export const ContentItemModel = mongoose.models.DrHairContentItem || mongoose.model('DrHairContentItem', contentItemSchema);
export const VideoModel = mongoose.models.DrHairVideo || mongoose.model('DrHairVideo', videoSchema);
export const ProductModel = mongoose.models.DrHairProduct || mongoose.model('DrHairProduct', productSchema);
export const CartModel = mongoose.models.DrHairCart || mongoose.model('DrHairCart', cartSchema);
export const AddressModel = mongoose.models.DrHairAddress || mongoose.model('DrHairAddress', addressSchema);
export const InventoryLedgerModel = mongoose.models.DrHairInventoryLedger || mongoose.model('DrHairInventoryLedger', inventoryLedgerSchema);
export const OrderModel = mongoose.models.DrHairOrder || mongoose.model('DrHairOrder', orderSchema);
export const SessionModel = mongoose.models.DrHairSession || mongoose.model('DrHairSession', sessionSchema);
export const AuditEventModel = mongoose.models.DrHairAuditEvent || mongoose.model('DrHairAuditEvent', auditEventSchema);
export const RateLimitCounterModel = mongoose.models.DrHairRateLimitCounter || mongoose.model('DrHairRateLimitCounter', rateLimitCounterSchema);
export const FeatureFlagModel = mongoose.models.DrHairFeatureFlag || mongoose.model('DrHairFeatureFlag', featureFlagSchema);
export const AppReleasePolicyModel = mongoose.models.DrHairAppReleasePolicy || mongoose.model('DrHairAppReleasePolicy', appReleasePolicySchema);
const CounterModel = mongoose.models.DrHairCounter || mongoose.model('DrHairCounter', counterSchema);

export const nextUserId = async () => {
  const highestUser = await UserModel.findOne().sort({ id: -1 }).select('id').lean();
  if (highestUser?.id) {
    await CounterModel.updateOne(
      { _id: 'users' },
      { $max: { seq: highestUser.id } },
      { upsert: true },
    );
  }
  return nextId('users');
};

export const nextId = async (counterName, offset = 0) => {
  const counter = await CounterModel.findOneAndUpdate(
    { _id: counterName },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return counter.seq + offset;
};
