// Modules Repositories & Services
import { OtpRepository } from './modules/auth/infrastructure/OtpRepository.js';
import { SmsService } from './modules/auth/infrastructure/SmsService.js';
import { UserRepository } from './modules/users/infrastructure/UserRepository.js';
import { HairTestRepository } from './modules/hair_test/infrastructure/HairTestRepository.js';
import { TreatmentRepository } from './modules/treatment/infrastructure/TreatmentRepository.js';
import { ReviewRepository } from './modules/review/infrastructure/ReviewRepository.js';

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

// Controllers
import { AuthController } from './modules/auth/presentation/auth.controller.js';
import { UserController } from './modules/users/presentation/user.controller.js';
import { HairTestController } from './modules/hair_test/presentation/hair_test.controller.js';
import { TreatmentController } from './modules/treatment/presentation/treatment.controller.js';
import { ReviewController } from './modules/review/presentation/review.controller.js';

// Routers
import { createAuthRouter } from './modules/auth/presentation/auth.routes.js';
import { createUserRouter } from './modules/users/presentation/user.routes.js';
import { createHairTestRouter } from './modules/hair_test/presentation/hair_test.routes.js';
import { createTreatmentRouter } from './modules/treatment/presentation/treatment.routes.js';
import { createReviewRouter } from './modules/review/presentation/review.routes.js';

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
  });

  const submitHairTestUseCase = new SubmitHairTestUseCase({
    hairTestRepository,
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

  // 3. Presentation Layer (Controllers)
  const authController = new AuthController({
    sendOtpUseCase,
    verifyOtpUseCase,
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

  // 4. Routes
  const authRouter = createAuthRouter({ authController });
  const userRouter = createUserRouter({ userController });
  const hairTestRouter = createHairTestRouter({ hairTestController });
  const treatmentRouter = createTreatmentRouter({ treatmentController });
  const reviewRouter = createReviewRouter({ reviewController });

  return {
    repositories: {
      otpRepository,
      userRepository,
      hairTestRepository,
      treatmentRepository,
      reviewRepository,
    },
    services: {
      smsService,
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
    },
    controllers: {
      authController,
      userController,
      hairTestController,
      treatmentController,
      reviewController,
    },
    routers: {
      authRouter,
      userRouter,
      hairTestRouter,
      treatmentRouter,
      reviewRouter,
    },
  };
};

