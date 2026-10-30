import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/env.js';
import { createContainer } from './container.js';
import { errorHandler } from './shared/middlewares/error.middleware.js';
import { NotFoundError } from './shared/errors/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const createApp = () => {
  const app = express();
  const container = createContainer();

  // 1. Global Middlewares
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  
  if (config.env !== 'test') {
    app.use(morgan('dev'));
  }

  // 2. Static File Serving for Uploaded Assets (Profile photos & Scalp photos)
  const uploadsStaticPath = path.resolve(__dirname, '../uploads');
  app.use('/uploads', express.static(uploadsStaticPath));

  // 3. System & Health Check Endpoints
  app.get('/', (req, res) => {
    res.json({
      name: 'Dr. Hair Backend API',
      version: '1.0.0',
      status: 'operational',
      architecture: 'Modular Monolith + Clean Architecture',
      documentation: '/API_DOCUMENTATION.md',
      endpoints: {
        auth: ['/auth/send_login_otp', '/auth/verify_login_otp'],
        admin: ['/Admin/checkUser', '/Admin/loginSignup', '/Admin/get_profile', '/Admin/updateProfile', '/Admin/profileUpdate'],
        hairTest: ['/HairTest/submit_form', '/HairTest/hair_test', '/HairTest/get_treatment_history/:reference_no'],
        review: ['/Review/review_get'],
      },
    });
  });

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // 4. Exact Flutter App & Legacy Routes (Preserving case sensitivity as per API_DOCUMENTATION.md)
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

  // 5. Versioned RESTful API Routes (Modern Aliases)
  app.use('/api/v1/auth', container.routers.authRouter);
  app.use('/api/v1/users', container.routers.userRouter);
  app.use('/api/v1/hair-tests', container.routers.hairTestRouter);
  app.use('/api/v1/treatments', container.routers.treatmentRouter);
  app.use('/api/v1/reviews', container.routers.reviewRouter);

  // 6. 404 Route Not Found Handler
  app.use((req, res, next) => {
    next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
  });

  // 7. Global Error Handler
  app.use(errorHandler);

  return { app, container };
};

