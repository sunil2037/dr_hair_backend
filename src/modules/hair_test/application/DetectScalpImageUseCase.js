import { BadRequestError } from '../../../shared/errors/index.js';

export class DetectScalpImageUseCase {
  constructor({ geminiAiService }) {
    this.geminiAiService = geminiAiService;
  }

  async execute({ imageBuffer, base64Data, mimeType, label = 'Scalp' } = {}) {
    if (!imageBuffer && !base64Data) {
      throw new BadRequestError('Image data or upload is required.');
    }

    if (!this.geminiAiService) {
      return {
        is_hair: false,
        status: 'verificationUnavailable',
        confidence: 0,
        detected_angle: label,
        follicle_visibility: 'Unknown',
        message: 'Photo verification is temporarily unavailable. Please retry.',
        details: 'The image verification service is not configured.',
        source: 'unavailable',
      };
    }

    return await this.geminiAiService.detectHairAndScalpImage({
      imageBuffer,
      base64Data,
      mimeType,
      label,
    });
  }
}

