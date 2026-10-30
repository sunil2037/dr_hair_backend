import { BadRequestError } from '../../../shared/errors/index.js';
import { sendSuccess } from '../../../shared/utils/response.js';

export class MediaController {
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
}
