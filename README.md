# 💈 Dr. Hair Backend - Modular Monolith with Clean Architecture

A robust, enterprise-grade Express.js backend engineered as a **Modular Monolith** using **Clean Architecture** principles.

This backend serves the **Dr. Hair** application ecosystem (Flutter mobile app and Admin Panel), implementing 100% of the specifications defined in [`flutter_app/API_DOCUMENTATION.md`](../flutter_app/API_DOCUMENTATION.md).

---

## 🏛️ Architecture Overview

The system blends **Modular Monolith** domain partitioning with Robert C. Martin's **Clean Architecture (Onion / Hexagonal Architecture)**:

```
                  ┌─────────────────────────────────────┐
                  │         HTTP / Express.js           │
                  │   (Controllers, Routes, Multer)     │  Presentation Layer
                  └──────────────────┬──────────────────┘
                                     │ calls
                                     ▼
                  ┌─────────────────────────────────────┐
                  │              Use Cases              │  Application Layer
                  │   (Pure Business Workflows & DTOs)  │
                  └──────────┬──────────────────▲───────┘
                             │ uses             │ implements
                             ▼                  │
      ┌─────────────────────────────┐    ┌──────┴──────────────────────┐
      │       Domain Entities       │    │     Infrastructure Layer    │
      │   & Repository Contracts    │    │ (In-Memory/DB Repositories, │
      │  (Zero External Frameworks) │    │  JWT, SMS/Email, Storage)   │
      └─────────────────────────────┘    └─────────────────────────────┘
```

### Key Architectural Tenets:
1. **The Dependency Rule**: Inner circles (Domain) have zero knowledge of outer circles (Express, Multer, Database).
2. **Domain Isolation**: Each business module (`auth`, `users`, `hair_test`, `treatment`, `review`) encapsulates its own domain entities, repository contracts, application use cases, and HTTP controllers.
3. **Inter-Module Communication**: Modules communicate via well-typed application use cases and domain interfaces, preventing tight coupling.
4. **Pluggable Persistence**: Repositories adhere to abstract interfaces (`IUserRepository`, etc.). Swapping in-memory/JSON storage for PostgreSQL, MySQL (via Prisma/TypeORM/Knex), or MongoDB requires zero changes to domain logic or HTTP controllers.

---

## 📁 Directory Structure

```
backend/
├── .env.example                       # Sample environment variables
├── .env                               # Active environment variables
├── .gitignore
├── package.json
├── README.md                          # Architecture & API documentation
├── uploads/                           # Uploaded media assets
│   ├── profiles/                      # User profile photos
│   └── scalp/                         # Multi-angle diagnostic scalp photos
└── src/
    ├── app.js                         # Express app assembly & global middleware
    ├── server.js                      # HTTP server runner & graceful shutdown
    ├── container.js                   # Dependency injection container
    │
    ├── config/
    │   └── env.js                     # Environment variable validation & defaults
    │
    ├── shared/                        # Cross-cutting reusable kernel
    │   ├── errors/                    # AppError, BadRequestError, UnauthorizedError, etc.
    │   ├── middlewares/               # auth.middleware, error.middleware, upload.middleware
    │   ├── utils/                     # response formatters, logger, JWT token service
    │   └── database/                  # Central repository data store with seed data
    │
    └── modules/                       # Cohesive Business Modules
        ├── auth/                      # Authentication & OTP Flow
        │   ├── domain/                # Otp entity, IOtpRepository interface
        │   ├── application/           # SendOtpUseCase, VerifyOtpUseCase
        │   ├── infrastructure/        # OtpRepository, SmsService
        │   └── presentation/          # auth.controller, auth.routes
        │
        ├── users/                     # Users & Profiles (/Admin/* endpoints)
        │   ├── domain/                # User entity, IUserRepository interface
        │   ├── application/           # CheckUserUseCase, RegisterUserUseCase, etc.
        │   ├── infrastructure/        # UserRepository
        │   └── presentation/          # user.controller, user.routes
        │
        ├── hair_test/                 # Hair Loss Questionnaire & Scalp Photos
        │   ├── domain/                # HairTest entity, IHairTestRepository interface
        │   ├── application/           # SubmitHairTestUseCase, GetHairTestsUseCase
        │   ├── infrastructure/        # HairTestRepository
        │   └── presentation/          # hair_test.controller, hair_test.routes
        │
        ├── treatment/                 # Doctor Diagnoses & Treatment Plans
        │   ├── domain/                # Treatment entity, ITreatmentRepository interface
        │   ├── application/           # GetTreatmentHistoryUseCase
        │   ├── infrastructure/        # TreatmentRepository
        │   └── presentation/          # treatment.controller, treatment.routes
        │
        └── review/                    # Patient Reviews & Testimonials
            ├── domain/                # Review entity, IReviewRepository interface
            ├── application/           # GetReviewsUseCase, CreateReviewUseCase
            ├── infrastructure/        # ReviewRepository
            └── presentation/          # review.controller, review.routes
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### 2. Install Dependencies
```bash
cd backend
npm install
```

### 3. Environment Variables
Copy `.env.example` to `.env` if not already present:
```bash
cp .env.example .env
```

Default configuration in `.env`:
```env
PORT=5001
NODE_ENV=development
BASE_URL=http://localhost:5001
JWT_SECRET=drhair_super_secure_jwt_secret_key_2026_change_in_production
JWT_EXPIRES_IN=30d
DEFAULT_TEST_OTP=123456
OTP_EXPIRY_MINUTES=10
```

### 4. Running the Server

#### Development Mode (with hot-reload):
```bash
npm run dev
```

#### Production Mode:
```bash
npm start
```

#### Running Tests:
```bash
npm test
```

---

## 📡 API Endpoints Reference

The backend mounts both **legacy Flutter-compatible endpoints** (matching `flutter_app/API_DOCUMENTATION.md`) and **standard versioned RESTful routes (`/api/v1/*`)**.

### 1. Authentication (`/auth`)
| Method | Endpoint | Description | Auth |
|---|---|---|:---:|
| `POST` | `/auth/send_login_otp` | Sends OTP to phone/email (`{ login }`) | ❌ |
| `POST` | `/auth/verify_login_otp` | Verifies 6-digit OTP & returns JWT (`{ login, otp }`) | ❌ |

> **Development Tip:** For any phone number or email, use default OTP `123456` in development mode.

### 2. User & Admin Profile (`/Admin`)
| Method | Endpoint | Description | Auth |
|---|---|---|:---:|
| `POST` | `/Admin/checkUser` | Validates session & returns user details | ✅ |
| `POST` | `/Admin/loginSignup` | Registers new user profile demographics | ❌ / Optional |
| `POST` | `/Admin/get_profile` | Retrieves user profile data | ✅ |
| `POST` | `/Admin/updateProfile` | Updates name, email, contact | ✅ |
| `POST` | `/Admin/profileUpdate` | Uploads profile picture avatar (`profile` file) | ✅ |

### 3. Hair Test Assessment (`/HairTest`)
| Method | Endpoint | Description | Auth |
|---|---|---|:---:|
| `POST` | `/HairTest/submit_form` | Submits complete hair questionnaire & scalp photos | ✅ |
| `POST` | `/HairTest/hair_test` | Retrieves user's hair test history | ✅ |
| `GET` | `/HairTest/get_treatment_history/:reference_no` | Doctor treatment plans by test reference | ✅ |

### 4. Reviews & Testimonials (`/Review`)
| Method | Endpoint | Description | Auth |
|---|---|---|:---:|
| `POST` | `/Review/review_get` | Fetches active testimonials for home page | ❌ |
| `POST` | `/Review/create` | Submits a new customer review | ❌ / Optional |

### 5. Static Assets & Media CDN
| URL Path | Description |
|---|---|
| `http://localhost:5001/uploads/profiles/:file_name` | User profile avatar photos |
| `http://localhost:5001/uploads/scalp/:file_name` | Scalp diagnostic photos |

---

## 🧪 Testing Credentials (Pre-seeded Demo Data)
The backend comes pre-seeded with test data for immediate Flutter integration:
- **Phone Number**: `9876543210`
- **Email**: `user@example.com`
- **OTP**: `123456`
- **Hair Test Reference**: `HT-2026-0042`

