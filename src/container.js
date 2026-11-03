// Modules Repositories & Services
import { OtpRepository } from './modules/auth/infrastructure/OtpRepository.js';
import { SmsService } from './modules/auth/infrastructure/SmsService.js';
import { UserRepository } from './modules/users/infrastructure/UserRepository.js';
import { HairTestRepository } from './modules/hair_test/infrastructure/HairTestRepository.js';
import { TreatmentRepository } from './modules/treatment/infrastructure/TreatmentRepository.js';
import { ReviewRepository } from './modules/review/infrastructure/ReviewRepository.js';
import { DeviceTokenRepository } from './modules/notifications/infrastructure/DeviceTokenRepository.js';
import { NotificationRepository } from './modules/notifications/infrastructure/NotificationRepository.js';
import { VideoRepository } from './modules/media/infrastructure/VideoRepository.js';
import { ProductRepository } from './modules/products/infrastructure/ProductRepository.js';
import { CartRepository } from './modules/cart/infrastructure/CartRepository.js';
import { AdminAccountRepository } from './modules/admin/infrastructure/AdminAccountRepository.js';
import { ClinicalReportRepository } from './modules/admin/infrastructure/ClinicalReportRepository.js';
import { CloudinaryImageStorage } from './modules/media/infrastructure/CloudinaryImageStorage.js';
import { AppointmentRepository } from './modules/appointments/infrastructure/AppointmentRepository.js';
import { PatientActivityRepository } from './modules/patient/infrastructure/PatientActivityRepository.js';
import { ProgressCheckInRepository } from './modules/patient/infrastructure/ProgressCheckInRepository.js';
import { MediaReferenceRepository } from './modules/media/infrastructure/MediaReferenceRepository.js';
import { PatientArchiveService } from './modules/admin/application/PatientArchiveService.js';
import { SessionRepository } from './modules/auth/infrastructure/SessionRepository.js';
import { AuditEventRepository } from './modules/admin/infrastructure/AuditEventRepository.js';

// Use Cases
import { SendOtpUseCase } from './modules/auth/application/SendOtpUseCase.js';
import { VerifyOtpUseCase } from './modules/auth/application/VerifyOtpUseCase.js';
import { CheckUserUseCase } from './modules/users/application/CheckUserUseCase.js';
import { RegisterUserUseCase } from './modules/users/application/RegisterUserUseCase.js';
import { GetProfileUseCase } from './modules/users/application/GetProfileUseCase.js';
import { UpdateProfileUseCase } from './modules/users/application/UpdateProfileUseCase.js';
import { UpdateProfilePictureUseCase } from './modules/users/application/UpdateProfilePictureUseCase.js';
import { DeleteAccountUseCase } from './modules/users/application/DeleteAccountUseCase.js';
import { SubmitHairTestUseCase } from './modules/hair_test/application/SubmitHairTestUseCase.js';
import { GetHairTestsUseCase } from './modules/hair_test/application/GetHairTestsUseCase.js';
import { GetTreatmentHistoryUseCase } from './modules/treatment/application/GetTreatmentHistoryUseCase.js';
import { GetReviewsUseCase } from './modules/review/application/GetReviewsUseCase.js';
import { CreateReviewUseCase } from './modules/review/application/CreateReviewUseCase.js';
import { ListProductsUseCase } from './modules/products/application/ListProductsUseCase.js';
import { GetProductByIdUseCase } from './modules/products/application/GetProductByIdUseCase.js';
import { CreateProductUseCase } from './modules/products/application/CreateProductUseCase.js';
import { UpdateProductUseCase } from './modules/products/application/UpdateProductUseCase.js';
import { DeleteProductUseCase } from './modules/products/application/DeleteProductUseCase.js';
import { GetCartUseCase } from './modules/cart/application/GetCartUseCase.js';
import { AddToCartUseCase } from './modules/cart/application/AddToCartUseCase.js';
import { UpdateCartItemUseCase } from './modules/cart/application/UpdateCartItemUseCase.js';
import { RemoveCartItemUseCase } from './modules/cart/application/RemoveCartItemUseCase.js';
import { ClearCartUseCase } from './modules/cart/application/ClearCartUseCase.js';
import { ApplyCouponUseCase } from './modules/cart/application/ApplyCouponUseCase.js';
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
import { ProductController } from './modules/products/presentation/product.controller.js';
import { CartController } from './modules/cart/presentation/cart.controller.js';
import { AdminController } from './modules/admin/presentation/admin.controller.js';
import { AdminAuthController } from './modules/admin/presentation/admin-auth.controller.js';
import { PatientClinicalController } from './modules/patient/presentation/patient-clinical.controller.js';
import { AppointmentController } from './modules/appointments/presentation/appointment.controller.js';

// Routers
import { createAuthRouter } from './modules/auth/presentation/auth.routes.js';
import { createUserRouter } from './modules/users/presentation/user.routes.js';
import { createHairTestRouter } from './modules/hair_test/presentation/hair_test.routes.js';
import { createTreatmentRouter } from './modules/treatment/presentation/treatment.routes.js';
import { createReviewRouter } from './modules/review/presentation/review.routes.js';
import { createNotificationRouter } from './modules/notifications/presentation/notification.routes.js';
import { createVideoRouter } from './modules/media/presentation/video.routes.js';
import { createProductRouters } from './modules/products/presentation/product.routes.js';
import { createCartRouter } from './modules/cart/presentation/cart.routes.js';
import { MediaController } from './modules/media/presentation/media.controller.js';
import { createMediaRouter } from './modules/media/presentation/media.routes.js';
import { createAdminRouter } from './modules/admin/presentation/admin.routes.js';
import { createAdminAuthRouter } from './modules/admin/presentation/admin-auth.routes.js';
import { createPatientClinicalRouter } from './modules/patient/presentation/patient-clinical.routes.js';

/**
 * Dependency Injection Container
 * Initializes and wires clean architecture components
 */
export const createContainer = (overrides = {}) => {
  // 1. Infrastructure Layer (Repositories & External Services)
  const otpRepository = overrides.otpRepository || new OtpRepository();
  const smsService = overrides.smsService || new SmsService();
  const userRepository = overrides.userRepository || new UserRepository();
  const hairTestRepository = overrides.hairTestRepository || new HairTestRepository();
  const treatmentRepository = overrides.treatmentRepository || new TreatmentRepository();
  const reviewRepository = overrides.reviewRepository || new ReviewRepository();
  const deviceTokenRepository = overrides.deviceTokenRepository || new DeviceTokenRepository();
  const notificationRepository = overrides.notificationRepository || new NotificationRepository();
  const videoRepository = overrides.videoRepository || new VideoRepository();
  const productRepository = overrides.productRepository || new ProductRepository();
  const cartRepository = overrides.cartRepository || new CartRepository();
  const adminAccountRepository = overrides.adminAccountRepository || new AdminAccountRepository();
  const clinicalReportRepository = overrides.clinicalReportRepository || new ClinicalReportRepository();
  const appointmentRepository = overrides.appointmentRepository || new AppointmentRepository();
  const patientActivityRepository = overrides.patientActivityRepository || new PatientActivityRepository();
  const progressCheckInRepository = overrides.progressCheckInRepository || new ProgressCheckInRepository();
  const mediaReferenceRepository = overrides.mediaReferenceRepository || new MediaReferenceRepository();
  const patientArchiveService =
    overrides.patientArchiveService || new PatientArchiveService({ clinicalReportRepository });
  const imageStorage = overrides.imageStorage || new CloudinaryImageStorage();
  const sessionRepository = overrides.sessionRepository || new SessionRepository();
  const auditEventRepository = overrides.auditEventRepository || new AuditEventRepository();

  // 2. Application Layer (Use Cases)
  const sendOtpUseCase = new SendOtpUseCase({
    otpRepository,
    smsService,
  });

  const verifyOtpUseCase = new VerifyOtpUseCase({
    otpRepository,
    userRepository,
    sessionRepository,
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

  const deleteAccountUseCase = new DeleteAccountUseCase({
    userRepository,
  });

  const submitHairTestUseCase = new SubmitHairTestUseCase({
    hairTestRepository,
    imageStorage,
  });

  const getHairTestsUseCase = new GetHairTestsUseCase({
    hairTestRepository,
    imageStorage,
  });

  const getTreatmentHistoryUseCase = new GetTreatmentHistoryUseCase({
    treatmentRepository,
    clinicalReportRepository,
  });

  const getReviewsUseCase = new GetReviewsUseCase({
    reviewRepository,
  });

  const createReviewUseCase = new CreateReviewUseCase({
    reviewRepository,
  });

  const adminAuthUseCase = new AdminAuthUseCase({ adminAccountRepository, sessionRepository });
  const createAdminAccountUseCase = new CreateAdminAccountUseCase({ adminAccountRepository });
  const listProductsUseCase = new ListProductsUseCase({ productRepository });
  const getProductByIdUseCase = new GetProductByIdUseCase({ productRepository });
  const createProductUseCase = new CreateProductUseCase({ productRepository });
  const updateProductUseCase = new UpdateProductUseCase({ productRepository });
  const deleteProductUseCase = new DeleteProductUseCase({ productRepository });
  const getCartUseCase = new GetCartUseCase({ cartRepository });
  const addToCartUseCase = new AddToCartUseCase({ cartRepository, productRepository });
  const updateCartItemUseCase = new UpdateCartItemUseCase({ cartRepository });
  const removeCartItemUseCase = new RemoveCartItemUseCase({ cartRepository });
  const clearCartUseCase = new ClearCartUseCase({ cartRepository });
  const applyCouponUseCase = new ApplyCouponUseCase({ cartRepository });

  // 3. Presentation Layer (Controllers)
  const authController = new AuthController({
    sendOtpUseCase,
    verifyOtpUseCase,
    userRepository,
    hairTestRepository,
    sessionRepository,
    deviceTokenRepository,
  });

  const userController = new UserController({
    checkUserUseCase,
    registerUserUseCase,
    getProfileUseCase,
    updateProfileUseCase,
    updateProfilePictureUseCase,
    deleteAccountUseCase,
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
  const notificationController = new NotificationController({ deviceTokenRepository, notificationRepository });
  const videoController = new VideoController({ videoRepository });
  const productController = new ProductController({
    listProductsUseCase,
    getProductByIdUseCase,
    createProductUseCase,
    updateProductUseCase,
    deleteProductUseCase,
  });
  const cartController = new CartController({
    getCartUseCase,
    addToCartUseCase,
    updateCartItemUseCase,
    removeCartItemUseCase,
    clearCartUseCase,
    applyCouponUseCase,
    notificationRepository,
    deviceTokenRepository,
  });
  const adminAuthController = new AdminAuthController({ adminAuthUseCase });
  const appointmentController = new AppointmentController({
    appointmentRepository,
    userRepository,
    patientActivityRepository,
    notificationRepository,
    deviceTokenRepository,
    auditEventRepository,
  });
  const patientClinicalController = new PatientClinicalController({
    hairTestRepository,
    treatmentRepository,
    clinicalReportRepository,
    appointmentRepository,
    patientActivityRepository,
    progressCheckInRepository,
    imageStorage,
  });
  const mediaController = new MediaController({ mediaReferenceRepository });
  const adminController = new AdminController({
    userRepository,
    hairTestRepository,
    treatmentRepository,
    clinicalReportRepository,
    reviewRepository,
    adminAccountRepository,
    createAdminAccountUseCase,
    imageStorage,
    appointmentRepository,
    patientActivityRepository,
    progressCheckInRepository,
    auditEventRepository,
  });

  // 4. Routes
  const authRouter = createAuthRouter({ authController });
  const userRouter = createUserRouter({ userController });
  const hairTestRouter = createHairTestRouter({ hairTestController });
  const treatmentRouter = createTreatmentRouter({ treatmentController });
  const reviewRouter = createReviewRouter({ reviewController });
  const notificationRouter = createNotificationRouter({ notificationController });
  const videoRouters = createVideoRouter({ videoController });
  const productRouters = createProductRouters({ productController });
  const cartRouter = createCartRouter({ cartController });
  const mediaRouter = createMediaRouter({ mediaController });
  const adminRouter = createAdminRouter({
    adminController,
    notificationController,
    videoController,
    appointmentController,
  });
  const adminAuthRouter = createAdminAuthRouter({ adminAuthController });
  const patientClinicalRouter = createPatientClinicalRouter({ patientClinicalController, appointmentController });

  return {
    repositories: {
      otpRepository,
      userRepository,
      hairTestRepository,
      treatmentRepository,
      clinicalReportRepository,
      appointmentRepository,
      patientActivityRepository,
      progressCheckInRepository,
      reviewRepository,
      deviceTokenRepository,
      notificationRepository,
      videoRepository,
      productRepository,
      cartRepository,
      mediaReferenceRepository,
      adminAccountRepository,
      sessionRepository,
      auditEventRepository,
    },
    services: {
      smsService,
      imageStorage,
      patientArchiveService,
    },
    useCases: {
      sendOtpUseCase,
      verifyOtpUseCase,
      checkUserUseCase,
      registerUserUseCase,
      getProfileUseCase,
      updateProfileUseCase,
      updateProfilePictureUseCase,
      deleteAccountUseCase,
      submitHairTestUseCase,
      getHairTestsUseCase,
      getTreatmentHistoryUseCase,
      getReviewsUseCase,
      createReviewUseCase,
      listProductsUseCase,
      getProductByIdUseCase,
      createProductUseCase,
      updateProductUseCase,
      deleteProductUseCase,
      getCartUseCase,
      addToCartUseCase,
      updateCartItemUseCase,
      removeCartItemUseCase,
      clearCartUseCase,
      applyCouponUseCase,
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
      productController,
      cartController,
      mediaController,
      adminController,
      adminAuthController,
      appointmentController,
      patientClinicalController,
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
      productPublicRouter: productRouters.publicRouter,
      productAdminRouter: productRouters.adminRouter,
      cartRouter,
      mediaRouter,
      adminRouter,
      adminAuthRouter,
      patientClinicalRouter,
    },
  };
};

