import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/env.js';
import { createContainer } from './container.js';
import { errorHandler } from './shared/middlewares/error.middleware.js';
import { NotFoundError } from './shared/errors/index.js';
import { databaseStatus } from './shared/database/mongodb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const createApp = () => {
  const app = express();
  const container = createContainer();
  if (config.env === 'production') app.set('trust proxy', 1);

  // 1. Global Middlewares
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) {
          return callback(null, true);
        }
        if (config.cors.origins.includes(origin)) return callback(null, true);
        if (config.cors.origins.includes('*') || (config.isDev && config.cors.origins.length === 0)) {
          return callback(null, true);
        }
        return callback(null, false);
      },
    }),
  );
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  if (config.env !== 'test') {
    app.use(morgan('dev'));
  }

  // 2. System & Health Check Endpoints
  app.get('/', (req, res) => {
    const db = databaseStatus();
    const healthy = config.env !== 'production' || db === 'connected';
    res.status(healthy ? 200 : 503).json({
      name: 'Dr. Hair Backend API',
      version: '1.0.0',
      status: healthy ? 'operational' : 'unavailable',
      database: db,
      architecture: 'Modular Monolith + Clean Architecture',
      documentation: '/api/docs',
      openapi: '/api/openapi.yaml',
      endpoints: {
        auth: ['/auth/send_login_otp', '/auth/verify_login_otp'],
        adminAuth: ['/api/v1/admin-auth/login'],
        users: ['/api/v1/users/checkUser', '/api/v1/users/loginSignup', '/api/v1/users/get_profile'],
        hairTest: ['/HairTest/submit_form', '/HairTest/hair_test', '/HairTest/get_treatment_history/:reference_no'],
        review: ['/Review/review_get'],
        videos: ['/api/v1/videos'],
        media: ['/api/v1/media/upload'],
        notifications: ['/api/v1/notifications/device-tokens'],
        admin: ['/api/v1/admin/users', '/api/v1/admin/hair-tests', '/api/v1/admin/treatments', '/api/v1/admin/reviews'],
      },
    });
  });

  app.get('/health', (req, res) => {
    const db = databaseStatus();
    const healthy = config.env !== 'production' || db === 'connected';
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'unavailable',
      database: db,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // API contract and interactive documentation. The spec is also available
  // as a standalone file for Flutter/admin client integration.
  app.get('/api/openapi.yaml', (req, res, next) => {
    res.type('application/yaml');
    res.sendFile(path.resolve(__dirname, '../docs/openapi.yaml'), (error) => {
      if (error) next(error);
    });
  });
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(null, {
      customSiteTitle: 'Dr. Hair API Documentation',
      swaggerOptions: { url: '/api/openapi.yaml' },
    }),
  );

  // 3. Exact Flutter App & Legacy Routes (Preserving case sensitivity as per API_DOCUMENTATION.md)
  // Auth Module
  app.use('/auth', container.routers.authRouter);

  // Users Module (Mapped to /Admin and /admin)
  app.use('/Admin', container.routers.userRouter);
  app.use('/admin', container.routers.userRouter);

  // Hair Test Module (Mapped to /HairTest and /hairtest)
  app.use('/HairTest', container.routers.hairTestRouter);
  app.use('/HairTest', container.routers.treatmentRouter); // handles /HairTest/get_treatment_history/:reference_no
  app.use('/hairtest', container.routers.hairTestRouter);
  app.use('/hairtest', container.routers.treatmentRouter);

  // Reviews Module (Mapped to /Review and /review)
  app.use('/Review', container.routers.reviewRouter);
  app.use('/review', container.routers.reviewRouter);

  // 4. Versioned RESTful API Routes (Modern Aliases)
  app.use('/api/v1/auth', container.routers.authRouter);
  app.use('/api/v1/admin-auth', container.routers.adminAuthRouter);
  app.use('/api/v1/users', container.routers.userRouter);
  app.use('/api/v1/hair-tests', container.routers.hairTestRouter);
  app.use('/api/v1/treatments', container.routers.treatmentRouter);
  app.use('/api/v1/reviews', container.routers.reviewRouter);
  app.use('/api/v1/notifications', container.routers.notificationRouter);
  app.use('/api/v1/media', container.routers.mediaRouter);
  app.use('/api/v1/videos', container.routers.videoPublicRouter);
  app.use('/api/v1/admin', container.routers.adminRouter);
  app.use('/api/v1/patient', container.routers.patientClinicalRouter);

  // 5. 404 Route Not Found Handler
  app.use((req, res, next) => {
    next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
  });

  // 6. Global Error Handler
  app.use(errorHandler);

  return { app, container };
};

