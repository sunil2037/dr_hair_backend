import { v2 as cloudinary } from 'cloudinary';
import { config } from '../../../config/env.js';

export const getCloudinaryClient = () => {
  const { cloudName, apiKey, apiSecret } = config.cloudinary;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  return cloudinary;
};

/**
 * Creates a short-lived signature for a direct video upload from a trusted
 * admin client. Call only from an admin-authenticated API controller.
 */
export const createVideoUploadSignature = ({
  publicId,
  timestamp = Math.floor(Date.now() / 1000),
}) => {
  const client = getCloudinaryClient();
  const signedParams = {
    folder: config.cloudinary.videoFolder,
    timestamp,
  };

  if (publicId) signedParams.public_id = publicId;

  return {
    apiKey: config.cloudinary.apiKey,
    cloudName: config.cloudinary.cloudName,
    folder: config.cloudinary.videoFolder,
    resourceType: 'video',
    timestamp,
    ...(publicId ? { publicId } : {}),
    signature: client.utils.api_sign_request(
      signedParams,
      config.cloudinary.apiSecret,
    ),
  };
};

export const verifyUploadedVideo = async (publicId) => {
  const client = getCloudinaryClient();
  const folderPrefix = config.cloudinary.videoFolder + '/';
  if (
    typeof publicId !== 'string'
    || publicId.length > 180
    || !publicId.startsWith(folderPrefix)
    || publicId.includes('..')
  ) {
    throw new Error('Video public ID must belong to the configured Dr Hair video folder.');
  }

  const resource = await client.api.resource(publicId, { resource_type: 'video' });
  if (!resource.secure_url) throw new Error('Cloudinary did not return a secure video URL.');

  return {
    public_id: resource.public_id,
    secure_url: resource.secure_url,
    thumbnail_url: client.url(resource.public_id, {
      resource_type: 'video',
      format: 'jpg',
      transformation: [{ so: '0' }],
      secure: true,
    }),
    duration: Number.isFinite(resource.duration) ? resource.duration : null,
  };
};
