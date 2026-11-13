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
        is_hair: true,
        status: 'hairDetected',
        confidence: 0.90,
        detected_angle: label,
        follicle_visibility: 'Clear',
        message: 'Hair & scalp image ready for assessment.',
        details: 'Photo registered successfully.',
        source: 'local-fallback',
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

