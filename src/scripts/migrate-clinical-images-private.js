import { config } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../shared/database/mongodb.js';
import { HairTestModel, ProgressCheckInModel } from '../shared/database/models.js';
import { getCloudinaryClient } from '../modules/media/infrastructure/CloudinaryVideoStorage.js';

const apply = process.argv.includes('--apply');
const folderPrefix = `${config.cloudinary.imageFolder.replace(/^\/+|\/+$/g, '')}/`;
let scanned = 0;
let migrated = 0;
let alreadyPrivate = 0;
let skipped = 0;

const makePrivate = async (publicId) => {
  const client = getCloudinaryClient();
  for (const fromType of ['authenticated', 'upload', 'private']) {
    try {
      const asset = await client.api.resource(publicId, { resource_type: 'image', type: fromType });
      if (fromType === 'authenticated') return asset;
      if (!apply) return { ...asset, type: fromType };
      return await client.uploader.rename(publicId, publicId, {
        resource_type: 'image',
        type: fromType,
        to_type: 'authenticated',
        invalidate: true,
      });
    } catch (error) {
      if (error?.http_code !== 404 && error?.error?.http_code !== 404) throw error;
    }
  }
  throw new Error('Cloudinary could not find a clinical image in its expected delivery types.');
};

const migratePhoto = async (photo) => {
  if (!photo || photo.delivery_type === 'authenticated') {
    alreadyPrivate += 1;
    return photo;
  }
  const publicId = String(photo.file_name || photo.public_id || '').trim();
  if (!publicId.startsWith(folderPrefix) || publicId.includes('..')) {
    skipped += 1;
    return photo;
  }
  scanned += 1;
  if (!apply) return photo;
  const asset = await makePrivate(publicId);
  migrated += 1;
  return {
    ...photo,
    file_name: photo.file_name || publicId,
    public_id: photo.public_id || publicId,
    url: asset.secure_url || photo.url,
    delivery_type: 'authenticated',
    format: asset.format || photo.format || '',
    ...(asset.bytes ? { bytes: asset.bytes } : {}),
  };
};

try {
  if (!config.mongodb.uri) throw new Error('Set MONGODB_URI to the Atlas database before running this migration.');
  if (apply && !config.cloudinary.cloudName) throw new Error('Set Cloudinary credentials before using --apply.');
  await connectDatabase();

  const hairTests = await HairTestModel.find({ 'scalp_photos.0': { $exists: true } }).lean();
  for (const item of hairTests) {
    const photos = await Promise.all((item.scalp_photos || []).map(migratePhoto));
    if (apply && photos.some((photo, index) => photo !== item.scalp_photos[index])) {
      await HairTestModel.updateOne({ _id: item._id }, { $set: { scalp_photos: photos } });
    }
  }

  const checkIns = await ProgressCheckInModel.find({ 'photos.0': { $exists: true } }).lean();
  for (const item of checkIns) {
    const photos = await Promise.all((item.photos || []).map(migratePhoto));
    if (apply && photos.some((photo, index) => photo !== item.photos[index])) {
      await ProgressCheckInModel.updateOne({ _id: item._id }, { $set: { photos } });
    }
  }

  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', to_migrate: scanned, migrated, already_private: alreadyPrivate, skipped }));
} finally {
  await disconnectDatabase();
}
