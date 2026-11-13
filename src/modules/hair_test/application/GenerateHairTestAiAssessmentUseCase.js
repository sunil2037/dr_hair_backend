import { NotFoundError, UnauthorizedError, BadRequestError } from '../../../shared/errors/index.js';

export class GenerateHairTestAiAssessmentUseCase {
  constructor({ hairTestRepository, geminiAiService }) {
    this.hairTestRepository = hairTestRepository;
    this.geminiAiService = geminiAiService;
  }

  async execute({ userId, referenceNo }) {
    if (!referenceNo) {
      throw new BadRequestError('Assessment reference number is required.');
    }

    const hairTest = await this.hairTestRepository.findByReferenceNo(referenceNo);
    if (!hairTest) {
      throw new NotFoundError('Assessment not found for that reference number.');
    }

    // Verify ownership if userId is provided
    if (userId && hairTest.userId && String(hairTest.userId) !== String(userId)) {
      throw new UnauthorizedError('You are not authorized to access this assessment.');
    }

    if (!this.geminiAiService) {
      throw new BadRequestError('AI service is currently unavailable.');
    }

    const aiAssessment = await this.geminiAiService.generateHairTestAssessment(hairTest);
    const updatedTest = await this.hairTestRepository.saveAiAssessment(referenceNo, aiAssessment);

    return {
      message: 'AI hair assessment generated successfully.',
      reference_no: referenceNo,
      ai_assessment: aiAssessment,
      test: updatedTest || hairTest,
    };
  }
}

