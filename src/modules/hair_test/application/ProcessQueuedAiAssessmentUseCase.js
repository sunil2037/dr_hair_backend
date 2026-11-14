import { randomUUID } from 'node:crypto';

export class ProcessQueuedAiAssessmentUseCase {
  constructor({ hairTestRepository, geminiAiService, assessmentProductAvailabilityService, logger = console }) {
    this.hairTestRepository = hairTestRepository;
    this.geminiAiService = geminiAiService;
    this.assessmentProductAvailabilityService = assessmentProductAvailabilityService;
    this.logger = logger;
    this.workerId = randomUUID();
  }

  async processOne() {
    const hairTest = await this.hairTestRepository.claimNextAiAssessment(this.workerId);
    if (!hairTest) return false;

    try {
      let assessment = await this.geminiAiService.generateHairTestAssessment(hairTest);
      if (this.assessmentProductAvailabilityService) {
        assessment = await this.assessmentProductAvailabilityService.resolve(assessment);
      }
      const saved = await this.hairTestRepository.saveAiAssessment(hairTest.reference_no, assessment);
      if (!saved) throw new Error('assessment_record_missing');
      this.logger.info?.('Assessment AI job completed.');
    } catch {
      this.logger.error?.('Assessment AI job failed; patient can retry.');
      await this.hairTestRepository.markAiAssessmentFailed(hairTest.reference_no, 'processing_failed');
    }
    return true;
  }
}
