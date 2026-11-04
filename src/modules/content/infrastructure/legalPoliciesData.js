/**
 * Centralized Static & Master Legal Policy Documents
 * Aligned with DPDP Act 2023, Google Play Data Safety, Apple Guideline 5.1.1, and Dr. Hair Clinic operational standards.
 */

export const LEGAL_POLICIES = [
  {
    slug: 'privacy-policy',
    type: 'privacyPolicy',
    title: 'Privacy Policy',
    last_updated: 'October 31, 2026',
    effective_date: 'October 31, 2026',
    summary: 'Explains how Dr. Hair collects, uses, encrypts, and protects your personal data, scalp progression photographs, and clinical assessment responses in compliance with the Indian Digital Personal Data Protection (DPDP) Act 2023, Google Play Data Safety, and Apple App Store Guideline 5.1.1.',
    sections: [
      {
        title: '1. Introduction & Scope',
        content: 'Welcome to the Dr. Hair mobile application ("App"), operated by Dr. Hair & Cosmodent Clinic ("we", "our", or "us"), under the clinical leadership of Dr. Jai Bansal. This Privacy Policy governs the manner in which Dr. Hair collects, uses, maintains, and discloses information from patients and users.',
        bullet_points: [
          'Complies with the Indian Information Technology Act, 2000 and Digital Personal Data Protection Act, 2023.',
          'Complies with Google Play Developer Data Safety Policies and Apple App Store Guideline 5.1.1.',
          'Strictly no sale, trade, or rental of personal health data to advertising brokers.',
        ],
      },
      {
        title: '2. Information We Collect',
        content: 'We collect only the minimum necessary information required to deliver trichology care, manage clinic appointments, and facilitate hair health monitoring:',
        bullet_points: [
          'Account Identity: Full name, verified mobile phone number, and email address.',
          'Clinical Assessment Responses: Hair density self-assessments, scalp condition tags, age, and gender.',
          'Photographs: Scalp and hair progression photographs voluntarily uploaded for dermatologist review.',
          'Device & App Diagnostics: Push notification tokens, platform type, and crash diagnostics.',
        ],
      },
      {
        title: '3. Use & Protection of Scalp Photographs',
        content: 'Photographs uploaded through our hair assessment tool are classified as sensitive clinical records:',
        bullet_points: [
          'Encrypted at rest using AES-256 and transmitted exclusively over TLS 1.3 encryption.',
          'Accessible only to verified clinical specialists for formulating personalized treatment plans.',
          'Never used for public testimonials or marketing without explicit, revocable patient consent.',
        ],
      },
      {
        title: '4. Data Retention & Your Deletion Rights',
        content: 'You retain full statutory rights over your personal and clinical data as a Data Principal under the DPDP Act 2023:',
        bullet_points: [
          'Right to Access: View all submitted profile, assessment, and treatment records anytime in the app.',
          'Right to Erasure: Request permanent deletion directly in the app via Settings → Delete Account, or through our public web deletion portal at https://drhair-admin.vercel.app/delete-account.',
        ],
      },
      {
        title: '5. Grievance Redressal & Contact',
        content: 'For questions, data requests, or grievance redressal, please contact our designated Grievance Officer:',
        bullet_points: [
          'Clinic: Dr. Hair & Cosmodent Clinic, Jaipur, Rajasthan, India.',
          'Email: support@drhair.in | privacy@drhair.in',
          'Phone: +91-9876543210',
        ],
      },
    ],
  },
  {
    slug: 'terms-conditions',
    type: 'termsAndConditions',
    title: 'Terms & Conditions',
    last_updated: 'October 31, 2026',
    effective_date: 'October 31, 2026',
    summary: 'Standard End User License Agreement (EULA), medical tele-triage disclaimers, clinic appointment rules, user obligations, and intellectual property terms for Dr. Hair mobile application.',
    sections: [
      {
        title: '1. Acceptance of Terms',
        content: 'By downloading, accessing, or using the Dr. Hair mobile application or booking clinic consultations, you agree to be bound by these Terms and Conditions and our Privacy Policy. If you do not agree, do not use the application.',
      },
      {
        title: '2. Medical & Tele-Triage Disclaimer',
        content: 'Dr. Hair provides trichological digital assessment, wellness guidance, and doctor consultation booking. It is not an emergency medical service.',
        bullet_points: [
          'Digital hair assessment results are educational and assist preliminary clinical triage.',
          'Prescriptions and therapeutic protocols are formulated exclusively by certified doctors following consultation.',
          'For acute scalp infections, severe allergic reactions, or medical emergencies, consult an emergency physician immediately.',
        ],
      },
      {
        title: '3. Appointments & Prescriptions',
        content: 'OPD appointments with Dr. Jai Bansal can be scheduled in-app. In-clinic consultation fees are payable at the clinic or through authorized gateways. Prescribed medicines must be taken strictly as directed by the clinical team.',
      },
      {
        title: '4. User Conduct & Security',
        content: 'You agree to provide accurate information and keep your OTP verification credentials secure. Misuse of the platform or uploading offensive non-clinical imagery will result in immediate account suspension.',
      },
    ],
  },
  {
    slug: 'refund-policy',
    type: 'returnsAndRefunds',
    title: 'Return & Refund Policy',
    last_updated: 'October 31, 2026',
    effective_date: 'October 31, 2026',
    summary: 'Transparent guidelines regarding cancellations, transit damage claims, hygiene seals, and refunds for clinic appointments and hair care products.',
    sections: [
      {
        title: '1. OPD Clinic Appointments',
        content: 'Patients can reschedule OPD doctor appointments at no extra charge up to 2 hours before the scheduled time slot. For prepaid appointments cancelled at least 4 hours in advance, a 100% refund is initiated.',
      },
      {
        title: '2. Hair Care Products & Topical Serums',
        content: 'Due to medical hygiene standards, products with broken security or hygiene seals cannot be returned. We accept returns within 7 calendar days of delivery if:',
        bullet_points: [
          'The product arrived in damaged, leaking, or compromised physical packaging.',
          'The item received differs from the ordered formulation.',
          'The tamper-evident hygiene seal is completely intact and unopened.',
        ],
      },
      {
        title: '3. Refund Processing Timelines',
        content: 'Approved refunds are credited to the original payment source (UPI, Card, Net Banking) within 5 to 7 business days from authorization.',
      },
    ],
  },
  {
    slug: 'cancellation-policy',
    type: 'cancellationPolicy',
    title: 'Cancellation Policy',
    last_updated: 'October 31, 2026',
    effective_date: 'October 31, 2026',
    summary: 'Cancellation windows, procedure guidelines, and cut-off timelines for appointments and pharmacy shipments.',
    sections: [
      {
        title: '1. Order Cancellations',
        content: 'Orders for hair care products and prescribed kits may be cancelled directly from the Orders tab anytime before the parcel is dispatched by our logistics partner.',
      },
      {
        title: '2. Clinical Consultation Slots',
        content: 'Consultation bookings can be cancelled or rescheduled directly through the app or by contacting clinic support at +91-9876543210.',
      },
    ],
  },
];
