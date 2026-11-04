import { sendSuccess } from '../../../shared/utils/response.js';
import { BadRequestError } from '../../../shared/errors/index.js';

export class TreatmentController {
  constructor({ getTreatmentHistoryUseCase, treatmentRepository }) {
    this.getTreatmentHistoryUseCase = getTreatmentHistoryUseCase;
    this.treatmentRepository = treatmentRepository;
  }

  getTreatmentHistory = async (req, res, next) => {
    try {
      const referenceNoOrId = req.params.reference_no || req.params.id;
      const data = await this.getTreatmentHistoryUseCase.execute({
        referenceNoOrId,
        userId: req.user?.id,
      });

      return sendSuccess(res, { data });
    } catch (err) {
      next(err);
    }
  };

  getPatientDietPlan = async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId || !this.treatmentRepository) {
        return sendSuccess(res, { data: { diet_meals: [] } });
      }

      const treatments = await this.treatmentRepository.findByUserId(userId);
      const treatmentWithDiet = treatments.find((t) => t.diet_meals && t.diet_meals.length > 0) || treatments[0];

      return sendSuccess(res, {
        data: {
          diet_meals: treatmentWithDiet?.diet_meals || [],
          treatment_name: treatmentWithDiet?.treatment_name || 'Personalized Care Plan',
          doctor_name: treatmentWithDiet?.doctor_name || 'Dr. Hair Clinical Team',
        },
      });
    } catch (err) {
      next(err);
    }
  };

  updatePatientDietPlan = async (req, res, next) => {
    try {
      const userId = req.params.userId || req.params.id;
      const { diet_meals } = req.body || {};
      if (!Array.isArray(diet_meals)) {
        throw new BadRequestError('diet_meals must be an array of meals.');
      }

      const updated = await this.treatmentRepository.updateDietMeals(userId, diet_meals);
      return sendSuccess(res, {
        message: 'Patient diet plan updated successfully.',
        data: { diet_meals: updated?.diet_meals || [] },
      });
    } catch (err) {
      next(err);
    }
  };
}

