import { sendSuccess } from '../../../shared/utils/response.js';
import { BadRequestError, NotFoundError } from '../../../shared/errors/index.js';

export class HairTestController {
  constructor({
    submitHairTestUseCase,
    getHairTestsUseCase,
    generateHairTestAiAssessmentUseCase,
    generateAssessmentDietPlanUseCase,
    detectScalpImageUseCase,
    hairTestRepository,
  }) {
    this.submitHairTestUseCase = submitHairTestUseCase;
    this.getHairTestsUseCase = getHairTestsUseCase;
    this.generateHairTestAiAssessmentUseCase = generateHairTestAiAssessmentUseCase;
    this.generateAssessmentDietPlanUseCase = generateAssessmentDietPlanUseCase;
    this.detectScalpImageUseCase = detectScalpImageUseCase;
    this.hairTestRepository = hairTestRepository;
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
          ai_assessment_status: result.ai_assessment_status,
        },
        extra: {
          reference_no: result.reference_no,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  getAiAssessmentStatus = async (req, res, next) => {
    try {
      const status = await this.hairTestRepository.getAiAssessmentStatus(
        req.params.referenceNo,
        req.user?.id,
      );
      if (!status) throw new NotFoundError('Assessment not found.');
      return sendSuccess(res, { data: status });
    } catch (err) {
      next(err);
    }
  };

  retryAiAssessment = async (req, res, next) => {
    try {
      const queued = await this.hairTestRepository.retryAiAssessment(
        req.params.referenceNo,
        req.user?.id,
      );
      if (!queued) {
        const existing = await this.hairTestRepository.getAiAssessmentStatus(
          req.params.referenceNo,
          req.user?.id,
        );
        if (!existing) throw new NotFoundError('Assessment not found.');
        throw new BadRequestError('This assessment is not eligible for retry.');
      }
      return sendSuccess(res, {
        message: 'Your assessment is queued for processing.',
        data: { reference_no: queued.reference_no, status: queued.ai_assessment_status },
        statusCode: 202,
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

  generateDietPlan = async (req, res, next) => {
    try {
      const result = await this.generateAssessmentDietPlanUseCase.execute({
        userId: req.user?.id,
        referenceNo: req.params?.referenceNo,
      });
      return sendSuccess(res, {
        message: result.message,
        data: {
          reference_no: result.reference_no,
          meal_plan: result.meal_plan,
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

