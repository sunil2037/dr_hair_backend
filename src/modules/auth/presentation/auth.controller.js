import { sendSuccess } from '../../../shared/utils/response.js';

export class AuthController {
  constructor({ sendOtpUseCase, verifyOtpUseCase, userRepository, hairTestRepository }) {
    this.sendOtpUseCase = sendOtpUseCase;
    this.verifyOtpUseCase = verifyOtpUseCase;
    this.userRepository = userRepository;
    this.hairTestRepository = hairTestRepository;
  }

  sendLoginOtp = async (req, res, next) => {
    try {
      const login = req.body.login || req.body.mobile || req.body.email;
      const result = await this.sendOtpUseCase.execute({ login });

      return sendSuccess(res, {
        message: result.message,
        extra: result.testOtp ? { test_otp: result.testOtp } : {},
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

      let hasCompletedAssessment = false;
      let nextStep = 'COMPLETE_PROFILE';

      if (result.user?.id && this.hairTestRepository) {
        const tests = await this.hairTestRepository.findByUserId(result.user.id);
        hasCompletedAssessment = tests && tests.length > 0;
        nextStep = hasCompletedAssessment ? 'HOME' : 'ASSESSMENT';
      } else if (result.user) {
        nextStep = 'ASSESSMENT';
      }

      return sendSuccess(res, {
        message: result.message,
        extra: {
          token: result.token,
          is_registered: result.isRegistered,
          is_admin: result.isAdmin,
          has_completed_assessment: hasCompletedAssessment,
          next_step: nextStep,
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

      let hasCompletedAssessment = false;
      let latestAssessment = null;
      let nextStep = 'SIGN_IN';

      if (!user) {
        nextStep = 'COMPLETE_PROFILE';
      } else {
        if (this.hairTestRepository) {
          const tests = await this.hairTestRepository.findByUserId(user.id);
          if (tests && tests.length > 0) {
            hasCompletedAssessment = true;
            const latest = tests[0];
            latestAssessment = {
              reference_no: latest.reference_no,
              hair_loss_stage: latest.hair_loss_stage || latest.stage || null,
              dandruff: latest.dandruff || null,
              created_at: latest.created_at,
            };
          }
        }
        nextStep = hasCompletedAssessment ? 'HOME' : 'ASSESSMENT';
      }

      return sendSuccess(res, {
        data: {
          login: user?.email || user?.phone || req.user?.login || req.user?.email || req.user?.phone || null,
          name: user?.name || null,
          is_authenticated: true,
          is_registered: Boolean(user),
          is_admin: req.user?.role === 'admin',
          has_completed_assessment: hasCompletedAssessment,
          next_step: nextStep,
          latest_assessment: latestAssessment,
          ...(user ? { user: user.toPublicProfile() } : {}),
        },
      });
    } catch (err) {
      next(err);
    }
  };
}

