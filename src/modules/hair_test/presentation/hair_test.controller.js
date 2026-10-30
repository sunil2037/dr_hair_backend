import { sendSuccess } from '../../../shared/utils/response.js';

export class HairTestController {
  constructor({ submitHairTestUseCase, getHairTestsUseCase }) {
    this.submitHairTestUseCase = submitHairTestUseCase;
    this.getHairTestsUseCase = getHairTestsUseCase;
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
}

