import { NotFoundError, UnauthorizedError, BadRequestError } from '../../../shared/errors/index.js';

export class GenerateHairTestAiAssessmentUseCase {
  constructor({ hairTestRepository, geminiAiService, assessmentProductAvailabilityService }) {
    this.hairTestRepository = hairTestRepository;
    this.geminiAiService = geminiAiService;
    this.assessmentProductAvailabilityService = assessmentProductAvailabilityService;
  }

  async execute({ userId, referenceNo }) {
    if (!referenceNo) {
      throw new BadRequestError('Assessment reference number is required.');
    }

    const hairTest = await this.hairTestRepository.findByReferenceNo(referenceNo);
    if (!hairTest) {
      throw new NotFoundError('Assessment not found for that reference number.');
    }

    // AI assessment is patient-facing and must never expose unowned legacy records.
    if (!userId || !hairTest.userId || String(hairTest.userId) !== String(userId)) {
      throw new UnauthorizedError('You are not authorized to access this assessment.');
    }

    if (!this.geminiAiService) {
      throw new BadRequestError('AI service is currently unavailable.');
    }

    let aiAssessment = await this.geminiAiService.generateHairTestAssessment(hairTest);
    if (this.assessmentProductAvailabilityService) {
      aiAssessment = await this.assessmentProductAvailabilityService.resolve(aiAssessment);
    }
    const updatedTest = await this.hairTestRepository.saveAiAssessment(referenceNo, aiAssessment);

    return {
      message: 'AI hair assessment generated successfully.',
      reference_no: referenceNo,
      ai_assessment: aiAssessment,
      test: updatedTest || hairTest,
    };
  }
}

