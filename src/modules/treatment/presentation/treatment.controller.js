import { sendSuccess } from '../../../shared/utils/response.js';

export class TreatmentController {
  constructor({ getTreatmentHistoryUseCase }) {
    this.getTreatmentHistoryUseCase = getTreatmentHistoryUseCase;
  }

  getTreatmentHistory = async (req, res, next) => {
    try {
      const referenceNoOrId = req.params.reference_no || req.params.id;
      const data = await this.getTreatmentHistoryUseCase.execute({ referenceNoOrId });

      return sendSuccess(res, { data });
    } catch (err) {
      next(err);
    }
  };
}

