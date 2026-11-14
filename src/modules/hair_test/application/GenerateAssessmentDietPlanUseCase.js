import { BadRequestError, NotFoundError, UnauthorizedError } from '../../../shared/errors/index.js';

export class GenerateAssessmentDietPlanUseCase {
  constructor({ hairTestRepository, treatmentRepository, progressCheckInRepository, geminiAiService }) {
    this.hairTestRepository = hairTestRepository;
    this.treatmentRepository = treatmentRepository;
    this.progressCheckInRepository = progressCheckInRepository;
    this.geminiAiService = geminiAiService;
  }

  async execute({ userId, referenceNo }) {
    if (!referenceNo) throw new BadRequestError('Assessment reference number is required.');
    const hairTest = await this.hairTestRepository.findByReferenceNo(referenceNo);
    if (!hairTest) throw new NotFoundError('Assessment not found for that reference number.');
    if (!userId || !hairTest.userId || String(hairTest.userId) !== String(userId)) {
      throw new UnauthorizedError('You are not authorized to access this assessment.');
    }

    const assessment = hairTest.ai_assessment;
    if (!assessment || assessment.ai_status === 'unavailable') {
      throw new BadRequestError('A completed AI assessment is required before creating a meal plan.');
    }
    const safetyRecommendation = this.geminiAiService.getConservativeNextStepRecommendation?.(hairTest);
    if (assessment.next_step_recommendation?.type === 'doctor_appointment' ||
        safetyRecommendation?.type === 'doctor_appointment') {
      throw new BadRequestError('Please speak with a clinician before creating a meal plan for this assessment.');
    }
    const medicalContext = [
      hairTest.medical_conditions,
      ...(Array.isArray(assessment.root_causes) ? assessment.root_causes.map((cause) => cause.factor) : []),
    ].flat().join(' ').toLowerCase();
    const medicationContext = String(hairTest.current_medications || '').toLowerCase();
    if (/\b(diabetes|kidney|renal|liver disease|heart disease|hypertension|high blood pressure|pregnan|celiac|coeliac|eating disorder|cancer|chemotherapy|thyroid|pcos|autoimmune|anemia|anaemia)\b/.test(medicalContext) ||
        /\b(warfarin|blood thinner|anticoagulant|insulin|immunosuppress|chemotherapy|thyroid medicine|levothyroxine)\b/.test(medicationContext)) {
      throw new BadRequestError('Please ask your clinician to review nutrition advice for your health condition.');
    }
    if (typeof this.geminiAiService?.generatePersonalizedDietPlan !== 'function') {
      throw new BadRequestError('The AI meal planning service is currently unavailable.');
    }

    const [carePlans, priorAssessments, progressCheckIns] = await Promise.all([
      this.treatmentRepository?.findByUserId
        ? this.treatmentRepository.findByUserId(userId)
        : [],
      this.hairTestRepository?.findByUserId
        ? this.hairTestRepository.findByUserId(userId)
        : [],
      this.progressCheckInRepository?.listByUserId
        ? this.progressCheckInRepository.listByUserId(userId)
        : [],
    ]);
    const clinicalContext = {
      care_plans: carePlans.slice(0, 5).map((plan) => ({
      diagnosis: plan.diagnosis || '',
      stage: plan.stage || '',
      treatment_name: plan.treatment_name || '',
      instructions: plan.instructions || '',
      medications: Array.isArray(plan.medications)
        ? plan.medications.map((medicine) => ({
            name: medicine.name || '',
            dose: medicine.dose || '',
            frequency: medicine.frequency || '',
          }))
        : [],
      diet_meals: Array.isArray(plan.diet_meals) ? plan.diet_meals : [],
      })),
      prior_assessments: priorAssessments
        .filter((assessment) => assessment.reference_no !== referenceNo && assessment.status !== 'draft')
        .slice(0, 5)
        .map((assessment) => ({
          duration: assessment.duration || assessment.hair_fall_start || '',
          hair_fall_pattern: assessment.hair_fall_pattern || '',
          dandruff: assessment.dandruff || '',
          scalp_condition: assessment.scalp_condition || '',
          medical_conditions: assessment.medical_conditions || [],
          allergy_status: assessment.allergy_status || '',
          allergy_details: assessment.allergy_details || '',
          current_medications: assessment.current_medications || '',
          ai_summary: assessment.ai_assessment?.summary || '',
        })),
      recent_progress: progressCheckIns.slice(0, 10).map((checkIn) => ({
        date: checkIn.date || '',
        scalp_region: checkIn.scalp_region || '',
        shedding_level: checkIn.shedding_level || '',
        notes: String(checkIn.notes || '').slice(0, 500),
        density_rating: checkIn.density_rating ?? null,
      })),
    };
    const mealPlan = await this.geminiAiService.generatePersonalizedDietPlan({
      ...hairTest,
      clinical_context: clinicalContext,
    });
    const updatedAssessment = { ...assessment, custom_meal_plan: mealPlan };
    const updatedTest = await this.hairTestRepository.saveAiAssessment(referenceNo, updatedAssessment);
    return {
      message: 'Your personalized meal plan is ready.',
      reference_no: referenceNo,
      meal_plan: mealPlan,
      ai_assessment: updatedAssessment,
      test: updatedTest || { ...hairTest, ai_assessment: updatedAssessment },
    };
  }
}
