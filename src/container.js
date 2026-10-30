// Modules Repositories & Services
import { OtpRepository } from './modules/auth/infrastructure/OtpRepository.js';
import { SmsService } from './modules/auth/infrastructure/SmsService.js';
import { UserRepository } from './modules/users/infrastructure/UserRepository.js';
import { HairTestRepository } from './modules/hair_test/infrastructure/HairTestRepository.js';
import { TreatmentRepository } from './modules/treatment/infrastructure/TreatmentRepository.js';
import { ReviewRepository } from './modules/review/infrastructure/ReviewRepository.js';
import { DeviceTokenRepository } from './modules/notifications/infrastructure/DeviceTokenRepository.js';
import { VideoRepository } from './modules/media/infrastructure/VideoRepository.js';
import { AdminAccountRepository } from './modules/admin/infrastructure/AdminAccountRepository.js';
import { CloudinaryImageStorage } from './modules/media/infrastructure/CloudinaryImageStorage.js';

// Use Cases
import { SendOtpUseCase } from './modules/auth/application/SendOtpUseCase.js';
import { VerifyOtpUseCase } from './modules/auth/application/VerifyOtpUseCase.js';
import { CheckUserUseCase } from './modules/users/application/CheckUserUseCase.js';
import { RegisterUserUseCase } from './modules/users/application/RegisterUserUseCase.js';
import { GetProfileUseCase } from './modules/users/application/GetProfileUseCase.js';
import { UpdateProfileUseCase } from './modules/users/application/UpdateProfileUseCase.js';
import { UpdateProfilePictureUseCase } from './modules/users/application/UpdateProfilePictureUseCase.js';
import { SubmitHairTestUseCase } from './modules/hair_test/application/SubmitHairTestUseCase.js';
import { GetHairTestsUseCase } from './modules/hair_test/application/GetHairTestsUseCase.js';
import { GetTreatmentHistoryUseCase } from './modules/treatment/application/GetTreatmentHistoryUseCase.js';
import { GetReviewsUseCase } from './modules/review/application/GetReviewsUseCase.js';
import { CreateReviewUseCase } from './modules/review/application/CreateReviewUseCase.js';
import { AdminAuthUseCase } from './modules/admin/application/AdminAuthUseCase.js';
import { CreateAdminAccountUseCase } from './modules/admin/application/CreateAdminAccountUseCase.js';

// Controllers
import { AuthController } from './modules/auth/presentation/auth.controller.js';
import { UserController } from './modules/users/presentation/user.controller.js';
import { HairTestController } from './modules/hair_test/presentation/hair_test.controller.js';
import { TreatmentController } from './modules/treatment/presentation/treatment.controller.js';
import { ReviewController } from './modules/review/presentation/review.controller.js';
import { NotificationController } from './modules/notifications/presentation/notification.controller.js';
import { VideoController } from './modules/media/presentation/video.controller.js';
import { AdminController } from './modules/admin/presentation/admin.controller.js';
import { AdminAuthController } from './modules/admin/presentation/admin-auth.controller.js';

// Routers
import { createAuthRouter } from './modules/auth/presentation/auth.routes.js';
import { createUserRouter } from './modules/users/presentation/user.routes.js';
import { createHairTestRouter } from './modules/hair_test/presentation/hair_test.routes.js';
import { createTreatmentRouter } from './modules/treatment/presentation/treatment.routes.js';
import { createReviewRouter } from './modules/review/presentation/review.routes.js';
import { createNotificationRouter } from './modules/notifications/presentation/notification.routes.js';
import { createVideoRouter } from './modules/media/presentation/video.routes.js';
import { MediaController } from './modules/media/presentation/media.controller.js';
import { createMediaRouter } from './modules/media/presentation/media.routes.js';
import { createAdminRouter } from './modules/admin/presentation/admin.routes.js';
import { createAdminAuthRouter } from './modules/admin/presentation/admin-auth.routes.js';

/**
 * Dependency Injection Container
 * Initializes and wires clean architecture components
 */
export const createContainer = () => {
  // 1. Infrastructure Layer (Repositories & External Services)
  const otpRepository = new OtpRepository();
  const smsService = new SmsService();
  const userRepository = new UserRepository();
  const hairTestRepository = new HairTestRepository();
  const treatmentRepository = new TreatmentRepository();
  const reviewRepository = new ReviewRepository();
  const deviceTokenRepository = new DeviceTokenRepository();
  const videoRepository = new VideoRepository();
  const adminAccountRepository = new AdminAccountRepository();
  const imageStorage = new CloudinaryImageStorage();

  // 2. Application Layer (Use Cases)
  const sendOtpUseCase = new SendOtpUseCase({
    otpRepository,
    userRepository,
    smsService,
  });

  const verifyOtpUseCase = new VerifyOtpUseCase({
    otpRepository,
    userRepository,
  });

  const checkUserUseCase = new CheckUserUseCase({
    userRepository,
  });

  const registerUserUseCase = new RegisterUserUseCase({
    userRepository,
  });

  const getProfileUseCase = new GetProfileUseCase({
    userRepository,
  });

  const updateProfileUseCase = new UpdateProfileUseCase({
    userRepository,
  });

  const updateProfilePictureUseCase = new UpdateProfilePictureUseCase({
    userRepository,
    imageStorage,
  });

  const submitHairTestUseCase = new SubmitHairTestUseCase({
    hairTestRepository,
    imageStorage,
  });

  const getHairTestsUseCase = new GetHairTestsUseCase({
    hairTestRepository,
  });

  const getTreatmentHistoryUseCase = new GetTreatmentHistoryUseCase({
    treatmentRepository,
  });

  const getReviewsUseCase = new GetReviewsUseCase({
    reviewRepository,
  });

  const createReviewUseCase = new CreateReviewUseCase({
    reviewRepository,
  });

  const adminAuthUseCase = new AdminAuthUseCase({ adminAccountRepository });
  const createAdminAccountUseCase = new CreateAdminAccountUseCase({ adminAccountRepository });

  // 3. Presentation Layer (Controllers)
  const authController = new AuthController({
    sendOtpUseCase,
    verifyOtpUseCase,
    userRepository,
  });

  const userController = new UserController({
    checkUserUseCase,
    registerUserUseCase,
    getProfileUseCase,
    updateProfileUseCase,
    updateProfilePictureUseCase,
  });

  const hairTestController = new HairTestController({
    submitHairTestUseCase,
    getHairTestsUseCase,
  });

  const treatmentController = new TreatmentController({
    getTreatmentHistoryUseCase,
  });

  const reviewController = new ReviewController({
    getReviewsUseCase,
    createReviewUseCase,
  });
  const notificationController = new NotificationController({ deviceTokenRepository });
  const videoController = new VideoController({ videoRepository });
  const adminAuthController = new AdminAuthController({ adminAuthUseCase });
  const mediaController = new MediaController();
  const adminController = new AdminController({
    userRepository,
    hairTestRepository,
    treatmentRepository,
    reviewRepository,
    adminAccountRepository,
    createAdminAccountUseCase,
  });

  // 4. Routes
  const authRouter = createAuthRouter({ authController });
  const userRouter = createUserRouter({ userController });
  const hairTestRouter = createHairTestRouter({ hairTestController });
  const treatmentRouter = createTreatmentRouter({ treatmentController });
  const reviewRouter = createReviewRouter({ reviewController });
  const notificationRouter = createNotificationRouter({ notificationController });
  const videoRouters = createVideoRouter({ videoController });
  const mediaRouter = createMediaRouter({ mediaController });
  const adminRouter = createAdminRouter({
    adminController,
    notificationController,
    videoController,
  });
  const adminAuthRouter = createAdminAuthRouter({ adminAuthController });

  return {
    repositories: {
      otpRepository,
      userRepository,
      hairTestRepository,
      treatmentRepository,
      reviewRepository,
      deviceTokenRepository,
      videoRepository,
      adminAccountRepository,
    },
    services: {
      smsService,
      imageStorage,
    },
    useCases: {
      sendOtpUseCase,
      verifyOtpUseCase,
      checkUserUseCase,
      registerUserUseCase,
      getProfileUseCase,
      updateProfileUseCase,
      updateProfilePictureUseCase,
      submitHairTestUseCase,
      getHairTestsUseCase,
      getTreatmentHistoryUseCase,
      getReviewsUseCase,
      createReviewUseCase,
      adminAuthUseCase,
      createAdminAccountUseCase,
    },
    controllers: {
      authController,
      userController,
      hairTestController,
      treatmentController,
      reviewController,
      notificationController,
      videoController,
      mediaController,
      adminController,
      adminAuthController,
    },
    routers: {
      authRouter,
      userRouter,
      hairTestRouter,
      treatmentRouter,
      reviewRouter,
      notificationRouter,
      videoPublicRouter: videoRouters.publicRouter,
      videoAdminRouter: videoRouters.adminRouter,
      mediaRouter,
      adminRouter,
      adminAuthRouter,
    },
  };
};

