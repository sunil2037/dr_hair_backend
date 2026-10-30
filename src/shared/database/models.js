import mongoose from 'mongoose';

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
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
    otp: { type: String, required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
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
    created_at: { type: Date, default: Date.now },
  },
  { collection: 'clinical_reports', versionKey: false },
);
clinicalReportSchema.index({ userId: 1, created_at: -1 });

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

const videoSchema = new Schema(
  {
    public_id: { type: String, required: true, unique: true, index: true },
    provider: { type: String, enum: ['cloudinary', 'youtube'], default: 'cloudinary' },
    youtube_video_id: { type: String, sparse: true, unique: true },
    title: { type: String, required: true, trim: true },
    category: { type: String, default: 'Hair Care', trim: true },
    description: { type: String, default: '' },
    placement: { type: String, enum: ['home', 'reels', 'both'], default: 'reels', index: true },
    secure_url: { type: String, required: true },
    thumbnail_url: { type: String, default: '' },
    duration: { type: Number, default: null },
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

export const UserModel = mongoose.models.DrHairUser || mongoose.model('DrHairUser', userSchema);
export const AdminAccountModel = mongoose.models.DrHairAdminAccount || mongoose.model('DrHairAdminAccount', adminAccountSchema);
export const OtpModel = mongoose.models.DrHairOtp || mongoose.model('DrHairOtp', otpSchema);
export const HairTestModel = mongoose.models.DrHairHairTest || mongoose.model('DrHairHairTest', hairTestSchema);
export const TreatmentModel = mongoose.models.DrHairTreatment || mongoose.model('DrHairTreatment', treatmentSchema);
export const ClinicalReportModel = mongoose.models.DrHairClinicalReport || mongoose.model('DrHairClinicalReport', clinicalReportSchema);
export const ReviewModel = mongoose.models.DrHairReview || mongoose.model('DrHairReview', reviewSchema);
export const DeviceTokenModel = mongoose.models.DrHairDeviceToken || mongoose.model('DrHairDeviceToken', deviceTokenSchema);
export const VideoModel = mongoose.models.DrHairVideo || mongoose.model('DrHairVideo', videoSchema);
const CounterModel = mongoose.models.DrHairCounter || mongoose.model('DrHairCounter', counterSchema);

export const nextId = async (counterName, offset = 0) => {
  const counter = await CounterModel.findOneAndUpdate(
    { _id: counterName },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return counter.seq + offset;
};
