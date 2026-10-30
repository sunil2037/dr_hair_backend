import { sendSuccess } from '../../../shared/utils/response.js';

export class AuthController {
  constructor({ sendOtpUseCase, verifyOtpUseCase }) {
    this.sendOtpUseCase = sendOtpUseCase;
    this.verifyOtpUseCase = verifyOtpUseCase;
  }

  sendLoginOtp = async (req, res, next) => {
    try {
      const login = req.body.login || req.body.mobile || req.body.email;
      const result = await this.sendOtpUseCase.execute({ login });

      return sendSuccess(res, {
        message: result.message,
        extra: {
          type: result.type,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  verifyLoginOtp = async (req, res, next) => {
    try {
      const login = req.body.login || req.body.mobile || req.body.email;
      const otp = req.body.otp;
      const result = await this.verifyOtpUseCase.execute({ login, otp });

      return sendSuccess(res, {
        message: result.message,
        extra: {
          token: result.token,
          is_registered: result.isRegistered,
        },
      });
    } catch (err) {
      next(err);
    }
  };
}

