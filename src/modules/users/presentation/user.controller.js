import { sendSuccess } from '../../../shared/utils/response.js';
import { TokenService } from '../../../shared/utils/token.service.js';
import { config } from '../../../config/env.js';

export class UserController {
  constructor({
    checkUserUseCase,
    registerUserUseCase,
    getProfileUseCase,
    updateProfileUseCase,
    updateProfilePictureUseCase,
  }) {
    this.checkUserUseCase = checkUserUseCase;
    this.registerUserUseCase = registerUserUseCase;
    this.getProfileUseCase = getProfileUseCase;
    this.updateProfileUseCase = updateProfileUseCase;
    this.updateProfilePictureUseCase = updateProfilePictureUseCase;
  }

  checkUser = async (req, res, next) => {
    try {
      const userId = req.user?.id;
      const login = req.user?.login;
      const data = await this.checkUserUseCase.execute({ userId, login });

      return sendSuccess(res, { data });
    } catch (err) {
      next(err);
    }
  };

  registerUser = async (req, res, next) => {
    try {
      const { name, email, phone, age, gender, city, occupation, platform } = req.body;
      const result = await this.registerUserUseCase.execute({
        name,
        email,
        phone,
        age,
        gender,
        city,
        occupation,
        platform,
        verifiedLogin: req.user?.login || req.user?.email || req.user?.phone,
        userId: req.user?.id,
      });
      const login = req.user?.login || req.user?.email || req.user?.phone || '';
      const isAdmin = config.admin.emails.includes(String(login).trim().toLowerCase());
      const token = TokenService.generateToken({
        id: result.user.id,
        login: req.user?.login || req.user?.email || req.user?.phone,
        name: result.user.name,
        email: result.user.email,
        phone: result.user.phone,
        isRegistered: true,
        role: isAdmin ? 'admin' : 'user',
      });

      // Align with documentation: { "status": true, "message": "User registered successfully." }
      return res.status(200).json({
        status: true,
        message: result.message,
        token,
        is_registered: true,
        is_admin: isAdmin,
        data: result.user ? result.user.toPublicProfile() : undefined,
      });
    } catch (err) {
      next(err);
    }
  };

  getProfile = async (req, res, next) => {
    try {
      const userId = req.user?.id;
      const profile = await this.getProfileUseCase.execute({ userId });

      return sendSuccess(res, { data: profile });
    } catch (err) {
      next(err);
    }
  };

  updateProfile = async (req, res, next) => {
    try {
      const userId = req.user?.id;
      const { name, email, contact } = req.body;
      const result = await this.updateProfileUseCase.execute({
        userId,
        name,
        email,
        contact,
        verifiedLogin: req.user?.login || req.user?.email || req.user?.phone,
      });

      return sendSuccess(res, { message: result.message });
    } catch (err) {
      next(err);
    }
  };

  updateProfilePicture = async (req, res, next) => {
    try {
      const userId = req.user?.id;
      const file = req.file;
      const action = req.body.action || 'upload';

      const result = await this.updateProfilePictureUseCase.execute({
        userId,
        file,
        action,
      });

      return sendSuccess(res, {
        message: result.message,
        data: {
          profile_url: result.profileUrl,
        },
      });
    } catch (err) {
      next(err);
    }
  };
}

