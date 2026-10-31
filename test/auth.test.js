import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createContainer } from '../src/container.js';

describe('Auth Module - Clean Architecture Tests', () => {
  const container = createContainer();
  const { sendOtpUseCase, verifyOtpUseCase } = container.useCases;

  it('should send OTP for existing user', async () => {
    const result = await sendOtpUseCase.execute({ login: '9876543210' });
    assert.ok(result.message);
  });

  it('should send OTP for new user', async () => {
    const result = await sendOtpUseCase.execute({ login: '9998887776' });
    assert.ok(result.message);
  });

  it('should verify OTP successfully and issue JWT token', async () => {
    const verifyResult = await verifyOtpUseCase.execute({
      login: '9876543210',
      otp: '123456',
    });

    assert.equal(verifyResult.message, 'OTP verified successfully.');
    assert.ok(verifyResult.token);
    assert.equal(verifyResult.isRegistered, true);
    assert.equal(verifyResult.user.id, 12);
  });

  it('should fail verification on invalid OTP', async () => {
    // Override NODE_ENV to production temporarily to test failure on wrong OTP
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await assert.rejects(
        async () => {
          await verifyOtpUseCase.execute({
            login: '9876543210',
            otp: '000000',
          });
        },
        { name: 'UnauthorizedError' }
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});

