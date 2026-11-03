import { sendSuccess } from '../../../shared/utils/response.js';
import { BadRequestError, UnauthorizedError } from '../../../shared/errors/index.js';
import { TokenService } from '../../../shared/utils/token.service.js';

export class AuthController {
  constructor({ sendOtpUseCase, verifyOtpUseCase, userRepository, hairTestRepository, sessionRepository, deviceTokenRepository }) {
    this.sendOtpUseCase = sendOtpUseCase;
    this.verifyOtpUseCase = verifyOtpUseCase;
    this.userRepository = userRepository;
    this.hairTestRepository = hairTestRepository;
    this.sessionRepository = sessionRepository;
    this.deviceTokenRepository = deviceTokenRepository;
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
      const deviceMetadata = {
        platform: req.headers?.['x-platform'] || req.body?.platform || 'app',
        userAgent: req.headers?.['user-agent'] || '',
        ip: req.ip || '',
      };
      const result = await this.verifyOtpUseCase.execute({ login, otp, deviceMetadata });

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
        data: {
          token: result.token,
          refresh_token: result.refreshToken,
          session_id: result.sessionId,
          is_registered: result.isRegistered,
          is_admin: result.isAdmin,
          has_completed_assessment: hasCompletedAssessment,
          next_step: nextStep,
          ...(result.user ? { user: result.user.toPublicProfile() } : {}),
        },
        extra: {
          token: result.token,
          refresh_token: result.refreshToken,
          session_id: result.sessionId,
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

  refreshToken = async (req, res, next) => {
    try {
      const sessionId = req.body?.session_id || req.body?.sessionId;
      const refreshToken = req.body?.refresh_token || req.body?.refreshToken;

      if (!sessionId || !refreshToken) {
        throw new BadRequestError('Both session_id and refresh_token are required.', null, 'VALIDATION_ERROR');
      }

      if (!this.sessionRepository) {
        throw new UnauthorizedError('Session rotation unavailable.', null, 'AUTH_REQUIRED');
      }

      const rotated = await this.sessionRepository.verifyAndRotate({
        sessionId,
        refreshToken,
      });

      if (!rotated) {
        throw new UnauthorizedError('Invalid or expired refresh token. Please sign in again.', null, 'AUTH_REQUIRED');
      }

      let user = null;
      if (rotated.userType === 'patient') {
        user = await this.userRepository.findById(Number(rotated.userId));
      }

      const tokenPayload = {
        id: user ? user.id : rotated.userId,
        login: user?.email || user?.phone || rotated.userId,
        name: user?.name || null,
        email: user?.email || null,
        phone: user?.phone || null,
        isRegistered: Boolean(user),
        role: rotated.userType === 'super_admin' ? 'super_admin' : (rotated.userType === 'admin' ? 'admin' : 'user'),
        sessionId: rotated.sessionId,
      };

      const newAccessToken = TokenService.generateAccessToken(tokenPayload);

      return sendSuccess(res, {
        message: 'Token refreshed successfully.',
        data: {
          token: newAccessToken,
          access_token: newAccessToken,
          refresh_token: rotated.refreshToken,
          session_id: rotated.sessionId,
          expires_at: rotated.expiresAt,
        },
        extra: {
          token: newAccessToken,
          refresh_token: rotated.refreshToken,
          session_id: rotated.sessionId,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  logout = async (req, res, next) => {
    try {
      const sessionId = req.body?.session_id || req.body?.sessionId || req.user?.sessionId;
      const deviceToken = req.body?.device_token || req.body?.deviceToken;

      if (sessionId && sessionId !== req.user?.sessionId) {
        throw new UnauthorizedError('The session does not belong to this access token.', null, 'AUTH_REQUIRED');
      }

      if (sessionId && this.sessionRepository) {
        await this.sessionRepository.revoke(sessionId, 'USER_LOGOUT');
      }

      if (deviceToken && this.deviceTokenRepository) {
        await this.deviceTokenRepository.removeToken(deviceToken);
      }

      return sendSuccess(res, {
        message: 'Successfully signed out.',
        data: { signed_out: true },
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
          id: user?.id || req.user?.id || null,
          login: user?.email || user?.phone || req.user?.login || req.user?.email || req.user?.phone || null,
          name: user?.name || null,
          is_authenticated: true,
          is_registered: Boolean(user),
          is_admin: req.user?.role === 'admin' || req.user?.role === 'super_admin',
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
