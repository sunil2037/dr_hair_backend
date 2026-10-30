import { sendSuccess } from '../../../shared/utils/response.js';

export class AdminAuthController {
  constructor({ adminAuthUseCase }) {
    this.adminAuthUseCase = adminAuthUseCase;
  }

  login = async (req, res, next) => {
    try {
      const result = await this.adminAuthUseCase.execute(req.body || {});
      return sendSuccess(res, { message: 'Admin signed in.', data: result });
    } catch (error) {
      next(error);
    }
  };
}
