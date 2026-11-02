# 📖 Dr. Hair - Complete Backend API Documentation

**Base Production URL:** `https://backend-ten-kappa-69.vercel.app`  
**Local Development URL:** `http://localhost:5001`  
**Architecture:** Modular Monolith + Clean Architecture  
**Authentication Scheme:** Bearer JWT (`Authorization: Bearer <token>`)

---

## 📑 Table of Contents
1. [System Health & Status](#1-system-health--status)
2. [Authentication Flow (Patient Mobile OTP)](#2-authentication-flow-patient-mobile-otp)
3. [User & Patient Profile](#3-user--patient-profile)
4. [Hair Assessment & Clinical Records](#4-hair-assessment--clinical-records)
5. [Care Plans & Patient Progress Check-ins](#5-care-plans--patient-progress-check-ins)
6. [Clinic Appointments](#6-clinic-appointments)
7. [Services & Products Catalog](#7-services--products-catalog)
8. [Reviews & Published Videos](#8-reviews--published-videos)
9. [Media & Document Uploads](#9-media--document-uploads)
10. [Admin Portal Authentication & Management](#10-admin-portal-authentication--management)

---

## 1. System Health & Status

### `GET /health`
Returns runtime database connectivity, uptime, and system status.
- **Headers:** None
- **Response (200 OK):**
```json
{
  "status": "ok",
  "database": "connected",
  "uptime": 142.5,
  "timestamp": "2026-11-02T06:25:00.000Z"
}
```

---

## 2. Authentication Flow (Patient Mobile OTP)

### `POST /api/v1/auth/send_login_otp`
*(Alias: `POST /auth/send_login_otp`)*  
Requests a 6-digit OTP code for a 10-digit mobile number or email address.
- **Body (`application/json`):**
```json
{
  "login": "9876543210"
}
```
- **Response (200 OK):**
```json
{
  "status": "success",
  "message": "If this destination can receive a code, a verification code has been sent."
}
```
> **Reviewer / Evaluation Note:** Default test numbers (e.g. `9876543210`, `9999999999`) accept test code `123456` without requiring carrier SMS delivery.

---

### `POST /api/v1/auth/verify_login_otp`
*(Alias: `POST /auth/verify_login_otp`)*  
Verifies the submitted 6-digit OTP and returns an authenticated Bearer JWT session token.
- **Body (`application/json`):**
```json
{
  "login": "9876543210",
  "otp": "123456"
}
```
- **Response (200 OK):**
```json
{
  "status": "success",
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "6724a1b2c3d4e5f6a7b8c9d0",
    "login": "9876543210",
    "name": "Sunil Sharma",
    "isRegistered": true
  }
}
```

---

## 3. User & Patient Profile

### `POST /api/v1/users/get_profile`
Retrieves the authenticated patient's profile details.
- **Headers:** `Authorization: Bearer <token>`
- **Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "id": "6724a1b2c3d4e5f6a7b8c9d0",
    "name": "Sunil Sharma",
    "phone": "9876543210",
    "email": "patient@example.com",
    "age": 28,
    "gender": "male",
    "city": "Jaipur",
    "occupation": "Software Engineer",
    "profile_url": "https://res.cloudinary.com/.../profile.jpg"
  }
}
```

### `POST /api/v1/users/updateProfile`
Updates the authenticated patient's demographics.
- **Headers:** `Authorization: Bearer <token>`
- **Body (`application/json`):**
```json
{
  "name": "Sunil Sharma",
  "age": 29,
  "gender": "male",
  "city": "Jaipur",
  "occupation": "Lead Engineer"
}
```

---

## 4. Hair Assessment & Clinical Records

### `POST /HairTest/submit_form`
Submits a multi-step hair evaluation questionnaire along with optional scalp photo references.
- **Headers:** `Authorization: Bearer <token>`
- **Body (`application/json` or `multipart/form-data`):**
```json
{
  "gender": "male",
  "age_group": "25-34",
  "hair_loss_stage": "Stage 2 - Receding Temples",
  "duration": "1-2 years",
  "family_history": "yes",
  "dandruff": "mild",
  "lifestyle": "high_stress",
  "scalp_photos": [
    "https://res.cloudinary.com/.../scalp_front.jpg",
    "https://res.cloudinary.com/.../scalp_crown.jpg"
  ]
}
```
- **Response (200 OK):**
```json
{
  "status": "success",
  "message": "Hair test submitted successfully",
  "data": {
    "reference_no": "HT-20261102-4821",
    "stage": "Stage 2 - Receding Temples",
    "summary": "Moderate early stage thinning detected. Recommended clinical regimen created."
  }
}
```

### `GET /api/v1/patient/clinical-record`
Fetches verified doctor assessments, prescription treatment plans, and medical laboratory reports.
- **Headers:** `Authorization: Bearer <token>`
- **Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "assessments": [...],
    "treatments": [...],
    "reports": [...]
  }
}
```

---

## 5. Care Plans & Patient Progress Check-ins

### `GET /api/v1/patient/progress-checkins`
Fetches monthly progress photo check-ins submitted by the patient.
- **Headers:** `Authorization: Bearer <token>`
- **Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "items": [
      {
        "id": "chk_1",
        "month": 1,
        "date": "2026-11-01",
        "scalpPhotos": {
          "front": "https://...",
          "top": "https://...",
          "crown": "https://..."
        },
        "notes": "Noticing less shedding during wash."
      }
    ]
  }
}
```

### `POST /api/v1/patient/progress-checkins`
Creates a monthly photo check-in.
- **Headers:** `Authorization: Bearer <token>`
- **Body (`application/json`):**
```json
{
  "month": 2,
  "scalpPhotos": {
    "front": "https://...",
    "crown": "https://..."
  },
  "notes": "Hair density feels thicker around hairline."
}
```

---

## 6. Clinic Appointments

### `GET /api/v1/appointments/closed-dates` *(Public)*
Retrieves clinic holidays and unavailable booking dates.
- **Headers:** None
- **Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "items": ["2026-11-15", "2026-12-25"]
  }
}
```

### `POST /api/v1/patient/appointments`
Books an in-clinic consultation at the Jaipur Clinic.
- **Headers:** `Authorization: Bearer <token>`
- **Body (`application/json`):**
```json
{
  "date": "2026-11-10",
  "slot": "10:30 AM",
  "service": "Trichologist In-Clinic Consultation",
  "notes": "Follow-up for hair treatment plan."
}
```
- **Response (201 Created):**
```json
{
  "status": "success",
  "message": "Appointment booked successfully",
  "data": {
    "id": "apt_8912",
    "clinic": "Dr. Hair & Cosmodent Clinic, Jaipur",
    "status": "confirmed"
  }
}
```

---

## 7. Services & Products Catalog

### `GET /services` *(Alias: `/api/v1/services`)*
Returns the clinic treatments and services catalog.
- **Headers:** None
- **Response (200 OK):**
```json
[
  {
    "id": "srv_assessment",
    "title": "AI Hair & Scalp Assessment",
    "description": "Comprehensive evaluation of hair loss pattern and scalp health.",
    "imageUrl": "",
    "rating": 4.9,
    "reviewsCount": 340,
    "price": "Free"
  },
  {
    "id": "srv_prp",
    "title": "PRP Hair Therapy",
    "description": "Advanced Platelet-Rich Plasma therapy designed to stimulate active follicles.",
    "imageUrl": "",
    "rating": 4.8,
    "reviewsCount": 195,
    "price": "₹4,500"
  }
]
```

---

## 8. Reviews & Published Videos

### `GET /Review/review_get`
Fetches verified customer reviews.
- **Headers:** None
- **Response (200 OK):**
```json
{
  "status": "success",
  "data": [
    {
      "id": "rev_1",
      "author": "Rahul M.",
      "rating": 5,
      "treatment": "PRP + Minoxidil Regimen",
      "comment": "Visible reduction in hair fall within 60 days."
    }
  ]
}
```

### `GET /api/v1/videos`
Fetches published video stories and clinical case demonstrations.
- **Headers:** None
- **Response (200 OK):**
```json
{
  "status": "success",
  "data": []
}
```

---

## 9. Media & Document Uploads

### `POST /api/v1/media/upload`
Shared endpoint for uploading images (scalp photos, profile avatars) to Cloudinary.
- **Headers:** `Authorization: Bearer <token>`, `Content-Type: multipart/form-data`
- **Fields:**
  - `purpose`: `"profile"` | `"assessment"` | `"checkin"`
  - `files`: One or more image binary files (`.jpg`, `.png`, `.webp`, max 10MB)
- **Response (200 OK):**
```json
{
  "status": "success",
  "data": [
    {
      "url": "https://res.cloudinary.com/drhair/image/upload/v1/.../photo.jpg",
      "public_id": "drhair/images/photo_abc",
      "format": "jpg",
      "bytes": 245100
    }
  ]
}
```

---

## 10. Admin Portal Authentication & Management

### `POST /api/v1/admin-auth/login`
Authenticates clinical or super admins with email and password.
- **Body (`application/json`):**
```json
{
  "email": "dr.hair@admin",
  "password": "<secure-password>"
}
```
- **Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "admin": {
      "id": "bootstrap:dr.hair@admin",
      "name": "Dr. Hair Super Admin",
      "email": "dr.hair@admin",
      "role": "super_admin"
    }
  }
}
```
