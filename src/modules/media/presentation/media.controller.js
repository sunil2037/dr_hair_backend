import { BadRequestError, ConflictError } from '../../../shared/errors/index.js';
import { sendSuccess } from '../../../shared/utils/response.js';
import { CloudinaryMediaStorage } from '../infrastructure/CloudinaryMediaStorage.js';

const mediaStorage = new CloudinaryMediaStorage();

export class MediaController {
  constructor({ mediaReferenceRepository }) {
    this.mediaReferenceRepository = mediaReferenceRepository;
  }

  upload = async (req, res, next) => {
    try {
      const assets = [
        ...(req.files?.file || []),
        ...(req.files?.files || []),
      ];
      if (assets.length === 0 || assets.some((asset) => !asset.secureUrl || !asset.publicId)) {
        throw new BadRequestError('Attach one or more media files in the "file" or "files" field.');
      }

      const items = assets.map((asset) => ({
        asset_id: asset.publicId,
        public_id: asset.publicId,
        url: asset.secureUrl,
        delivery_type: asset.deliveryType,
        purpose: asset.purpose,
        resource_type: asset.resourceType,
        format: asset.format,
        mime_type: asset.mimetype,
        bytes: asset.bytes,
        width: asset.width,
        height: asset.height,
        duration: asset.duration,
      }));

      return sendSuccess(res, {
        message: 'Media uploaded successfully.',
        statusCode: 201,
        data: {
          ...(items.length === 1 ? items[0] : {}),
          items,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  remove = async (req, res, next) => {
    try {
      const { public_id: publicId, resource_type: resourceType } = req.body || {};
      if (typeof publicId !== 'string' || !['image', 'video'].includes(resourceType)) {
        throw new BadRequestError('public_id and resource_type (image or video) are required.');
      }
      if (await this.mediaReferenceRepository.isReferenced(publicId)) {
        throw new ConflictError('This media is linked to a clinical or content record. Remove it from that record first.');
      }
      await mediaStorage.deleteOwnedOrphan({
        publicId: publicId.trim(),
        resourceType,
        ownerId: req.user.id,
        isAdmin: ['admin', 'super_admin'].includes(req.user?.role),
      });
      return sendSuccess(res, { message: 'Unattached media deleted from Cloudinary.' });
    } catch (error) {
      next(error);
    }
  };
}
