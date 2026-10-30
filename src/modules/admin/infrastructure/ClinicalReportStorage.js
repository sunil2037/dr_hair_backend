import { randomUUID } from 'node:crypto';
import { getCloudinaryClient } from '../../media/infrastructure/CloudinaryVideoStorage.js';

export async function uploadClinicalReport(file, userId) {
  const client = getCloudinaryClient();
  const id = randomUUID();
  const ext = ({ 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[file.mimetype] || 'bin';
  const publicId = `drhair/private-reports/user-${userId}/${id}.${ext}`;
  const result = await new Promise((resolve, reject) => {
    const stream = client.uploader.upload_stream(
      { resource_type: 'raw', type: 'authenticated', public_id: publicId, overwrite: false, unique_filename: false },
      (error, uploaded) => error ? reject(error) : resolve(uploaded),
    );
    stream.end(file.buffer);
  });
  return { id, public_id: result.public_id, asset_id: result.asset_id };
}

export function createClinicalReportDownloadUrl(publicId, format) {
  const client = getCloudinaryClient();
  return client.utils.private_download_url(publicId, format, {
    resource_type: 'raw',
    type: 'authenticated',
    expires_at: Math.floor(Date.now() / 1000) + 60,
    attachment: true,
  });
}

export async function deleteClinicalReport(publicId) {
  const client = getCloudinaryClient();
  await client.uploader.destroy(publicId, { resource_type: 'raw', type: 'authenticated' });
}
