import { sendSuccess } from '../../../shared/utils/response.js';

export class AuthController {
  constructor({ sendOtpUseCase, verifyOtpUseCase, userRepository }) {
    this.sendOtpUseCase = sendOtpUseCase;
    this.verifyOtpUseCase = verifyOtpUseCase;
    this.userRepository = userRepository;
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
          is_admin: result.isAdmin,
          ...(result.user ? { data: result.user.toPublicProfile() } : {}),
        },
      });
    } catch (err) {
      next(err);
    }
  };

  getSession = async (req, res, next) => {
    try {
      const user = req.user?.id
        ? await this.userRepository.findById(req.user.id)
        : null;
      return sendSuccess(res, {
        data: {
          login: user?.email || user?.phone || req.user?.login || req.user?.email || req.user?.phone || null,
          name: user?.name || null,
          is_registered: Boolean(user),
          is_admin: req.user?.role === 'admin',
          ...(user ? { user: user.toPublicProfile() } : {}),
        },
      });
    } catch (err) {
      next(err);
    }
  };
}

