import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createContainer } from '../src/container.js';

describe('Auth & Support V2 Clean Architecture Tests', () => {
  const sentOtps = new Map();
  const mockSmsService = {
    async sendOtp(destination, code) {
      sentOtps.set(destination, code);
      return true;
    },
  };

  const container = createContainer({
    smsService: mockSmsService,
  });

  const {
    sendSignupOtpUseCase,
    registerWithPasswordUseCase,
    loginWithPasswordUseCase,
    forgotPasswordUseCase,
    resetPasswordUseCase,
  } = container.useCases;

  const testPhone = '919876543299';
  const testEmail = 'patient.release.test@drhair.in';
  const testPassword = 'StrongPassword123!';

  it('should send signup OTP for an unregistered mobile number', async () => {
    const res = await sendSignupOtpUseCase.execute({
      phone: testPhone,
      email: testEmail,
    });
    assert.ok(res.message);
    assert.equal(res.requires_verification, true);
  });

  it('should register a new patient account with verified OTP and password', async () => {
    const clean = testPhone.slice(-10);
    const otp = sentOtps.get(clean) || sentOtps.get(testPhone) || '123456';
    const regResult = await registerWithPasswordUseCase.execute({
      name: 'Sunil Test Patient',
      email: testEmail,
      password: testPassword,
      phone: testPhone,
      otp,
    });

    assert.ok(regResult.token);
    assert.ok(regResult.user);
    assert.equal(regResult.user.email, testEmail);
    assert.ok(regResult.user.patient_code);
  });

  it('should authenticate patient via email and password', async () => {
    const loginResult = await loginWithPasswordUseCase.execute({
      email: testEmail,
      password: testPassword,
    });

    assert.ok(loginResult.token);
    assert.ok(loginResult.user);
    assert.equal(loginResult.user.email, testEmail);
  });

  it('should reject invalid password during login', async () => {
    await assert.rejects(
      async () => {
        await loginWithPasswordUseCase.execute({
          email: testEmail,
          password: 'IncorrectPassword!',
        });
      },
      (err) => {
        assert.equal(err.name, 'UnauthorizedError');
        return true;
      }
    );
  });

  it('should issue password reset OTP and reset password', async () => {
    const forgotRes = await forgotPasswordUseCase.execute({
      login: testEmail,
    });
    assert.ok(forgotRes.message);

    const clean = testPhone.slice(-10);
    const resetOtp = sentOtps.get(clean) || sentOtps.get(testPhone) || '123456';
    const newPassword = 'NewSecretPassword456!';
    const resetRes = await resetPasswordUseCase.execute({
      login: testEmail,
      otp: resetOtp,
      newPassword,
    });

    assert.equal(resetRes.success, true);

    // Verify login with new password
    const reLogin = await loginWithPasswordUseCase.execute({
      email: testEmail,
      password: newPassword,
    });
    assert.ok(reLogin.token);
  });

  it('should create and list support inquiries', async () => {
    const repo = container.repositories.supportInquiryRepository;
    const inquiry = await repo.create({
      name: 'Clinical Inquirer',
      contact: 'test@example.com',
      topic: 'Clinical Assessment',
      message: 'Experiencing thinning on crown area.',
    });

    assert.ok(inquiry.id);
    assert.equal(inquiry.topic, 'Clinical Assessment');
    assert.equal(inquiry.status, 'pending');

    const list = await repo.listAdmin({ page: 1, limit: 10 });
    assert.ok(list.items.length >= 1);

    const updated = await repo.updateStatus(inquiry.id, 'contacted');
    assert.equal(updated.status, 'contacted');
  });
});
