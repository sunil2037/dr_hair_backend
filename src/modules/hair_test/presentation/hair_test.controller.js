import { sendSuccess } from '../../../shared/utils/response.js';

export class HairTestController {
  constructor({
    submitHairTestUseCase,
    getHairTestsUseCase,
    generateHairTestAiAssessmentUseCase,
    detectScalpImageUseCase,
  }) {
    this.submitHairTestUseCase = submitHairTestUseCase;
    this.getHairTestsUseCase = getHairTestsUseCase;
    this.generateHairTestAiAssessmentUseCase = generateHairTestAiAssessmentUseCase;
    this.detectScalpImageUseCase = detectScalpImageUseCase;
  }

  submitForm = async (req, res, next) => {
    try {
      const userId = req.user?.id;
      const formData = req.body;
      const files = req.files || {};

      const result = await this.submitHairTestUseCase.execute({
        userId,
        formData,
        files,
      });

      return sendSuccess(res, {
        message: result.message,
        data: {
          reference_no: result.reference_no,
          test: result.test,
          ai_assessment: result.ai_assessment,
        },
        extra: {
          reference_no: result.reference_no,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  getHairTests = async (req, res, next) => {
    try {
      const userId = req.user?.id;
      const data = await this.getHairTestsUseCase.execute({ userId });

      return sendSuccess(res, { data });
    } catch (err) {
      next(err);
    }
  };

  generateAiAssessment = async (req, res, next) => {
    try {
      const userId = req.user?.id;
      const referenceNo = req.params?.referenceNo || req.body?.reference_no;

      const result = await this.generateHairTestAiAssessmentUseCase.execute({
        userId,
        referenceNo,
      });

      return sendSuccess(res, {
        message: result.message,
        data: {
          reference_no: result.reference_no,
          ai_assessment: result.ai_assessment,
          test: result.test,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  detectScalpImage = async (req, res, next) => {
    try {
      const file = req.file || req.files?.image?.[0] || req.files?.photo?.[0];
      const base64Data = req.body?.image_base64 || req.body?.base64;
      const label = req.body?.label || 'Scalp';
      const mimeType = file?.mimetype || req.body?.mime_type || 'image/jpeg';

      const result = await this.detectScalpImageUseCase.execute({
        imageBuffer: file?.buffer,
        base64Data,
        mimeType,
        label,
      });

      return sendSuccess(res, {
        message: result.message,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };
}

