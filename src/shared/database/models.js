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
    age: { type: Number, default: null },
    gender: { type: String, default: null },
    city: { type: String, default: null },
    occupation: { type: String, default: null },
    platform: { type: String, default: 'app' },
    profile_url: { type: String, default: null },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { collection: 'users', strict: false, versionKey: false },
);
userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ patient_code: 1 }, { unique: true, sparse: true });
userSchema.index({ role: 1, created_at: -1, id: -1 });

const adminAccountSchema = new Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin'], default: 'admin', required: true },
    active: { type: Boolean, default: true, index: true },
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
    type: { type: String, enum: ['login', 'register'], default: 'login' },
  },
  { collection: 'otps', versionKey: false },
);

const hairTestSchema = new Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    userId: { type: Number, index: true, default: null },
    reference_no: { type: String, required: true, unique: true, index: true },
    created_at: { type: String, default: () => new Date().toISOString() },
  },
  { collection: 'hair_tests', strict: false, versionKey: false },
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
    userId: { type: Number, required: true, index: true },
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

export const UserModel = mongoose.models.DrHairUser || mongoose.model('DrHairUser', userSchema);
export const AdminAccountModel = mongoose.models.DrHairAdminAccount || mongoose.model('DrHairAdminAccount', adminAccountSchema);
export const OtpModel = mongoose.models.DrHairOtp || mongoose.model('DrHairOtp', otpSchema);
export const HairTestModel = mongoose.models.DrHairHairTest || mongoose.model('DrHairHairTest', hairTestSchema);
export const TreatmentModel = mongoose.models.DrHairTreatment || mongoose.model('DrHairTreatment', treatmentSchema);
export const ClinicalReportModel = mongoose.models.DrHairClinicalReport || mongoose.model('DrHairClinicalReport', clinicalReportSchema);
export const AppointmentModel = mongoose.models.DrHairAppointment || mongoose.model('DrHairAppointment', appointmentSchema);
export const ClinicClosedDateModel = mongoose.models.DrHairClinicClosedDate || mongoose.model('DrHairClinicClosedDate', clinicClosedDateSchema);
export const PatientActivityModel = mongoose.models.DrHairPatientActivity || mongoose.model('DrHairPatientActivity', patientActivitySchema);
export const ProgressCheckInModel = mongoose.models.DrHairProgressCheckIn || mongoose.model('DrHairProgressCheckIn', progressCheckInSchema);
export const ReviewModel = mongoose.models.DrHairReview || mongoose.model('DrHairReview', reviewSchema);
export const DeviceTokenModel = mongoose.models.DrHairDeviceToken || mongoose.model('DrHairDeviceToken', deviceTokenSchema);
export const NotificationModel = mongoose.models.DrHairNotification || mongoose.model('DrHairNotification', notificationSchema);
export const VideoModel = mongoose.models.DrHairVideo || mongoose.model('DrHairVideo', videoSchema);
export const ProductModel = mongoose.models.DrHairProduct || mongoose.model('DrHairProduct', productSchema);
export const CartModel = mongoose.models.DrHairCart || mongoose.model('DrHairCart', cartSchema);
export const RateLimitCounterModel = mongoose.models.DrHairRateLimitCounter || mongoose.model('DrHairRateLimitCounter', rateLimitCounterSchema);
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
