import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createContainer } from '../src/container.js';
import { SmsService } from '../src/modules/auth/infrastructure/SmsService.js';

describe('Auth Module - Clean Architecture Tests', () => {
  // Use mock SMS service in unit tests to prevent hitting external Fast2SMS network
  const container = createContainer({
    smsService: new SmsService({ fast2smsConfig: { apiKey: '', route: 'otp' } }),
  });
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

  it('authController.verifyLoginOtp should return assessment status and next_step', async () => {
    const { authController } = container.controllers;
    const { sendOtpUseCase } = container.useCases;
    await sendOtpUseCase.execute({ login: '9876543210' });
    const req = { body: { login: '9876543210', otp: '123456' } };
    let jsonResult = null;
    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        jsonResult = data;
        return this;
      },
    };

    await authController.verifyLoginOtp(req, res, (err) => {
      if (err) throw err;
    });

    assert.ok(jsonResult);
    assert.equal(jsonResult.status, 'success');
    assert.equal(typeof jsonResult.has_completed_assessment, 'boolean');
    assert.ok(['COMPLETE_PROFILE', 'ASSESSMENT', 'HOME'].includes(jsonResult.next_step));
  });

  it('authController.getSession should return full user state with next_step', async () => {
    const { authController } = container.controllers;
    const req = { user: { id: 12, login: '9876543210' } };
    let jsonResult = null;
    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        jsonResult = data;
        return this;
      },
    };

    await authController.getSession(req, res, (err) => {
      if (err) throw err;
    });

    assert.ok(jsonResult);
    assert.equal(jsonResult.status, 'success');
    assert.ok(jsonResult.data);
    assert.equal(jsonResult.data.is_authenticated, true);
    assert.equal(jsonResult.data.is_registered, true);
    assert.equal(typeof jsonResult.data.has_completed_assessment, 'boolean');
    assert.ok(['COMPLETE_PROFILE', 'ASSESSMENT', 'HOME'].includes(jsonResult.data.next_step));
  });

  describe('Fast2SMS Integration in SmsService', () => {
    it('returns true in mock mode when FAST2SMS_API_KEY is not configured', async () => {
      const { SmsService } = await import('../src/modules/auth/infrastructure/SmsService.js');
      const service = new SmsService({ fast2smsConfig: { apiKey: '', route: 'otp' } });
      const result = await service.sendOtp('9876543210', '123456');
      assert.equal(result, true);
    });

    it('returns true without calling SMS gateway for email destinations', async () => {
      const { SmsService } = await import('../src/modules/auth/infrastructure/SmsService.js');
      const service = new SmsService({ fast2smsConfig: { apiKey: 'dummy_key', route: 'otp' } });
      const result = await service.sendOtp('patient@example.com', '123456');
      assert.equal(result, true);
    });

    it('dispatches to Fast2SMS API when apiKey is provided and cleans phone numbers', async () => {
      const { SmsService } = await import('../src/modules/auth/infrastructure/SmsService.js');
      const originalFetch = globalThis.fetch;
      let requestedUrl = null;
      let requestedBody = null;
      let requestedHeaders = null;

      globalThis.fetch = async (url, options) => {
        requestedUrl = url;
        requestedHeaders = options.headers;
        requestedBody = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            return: true,
            request_id: 'fast2sms_req_123',
            message: ['SMS sent successfully.'],
          }),
        };
      };

      try {
        const service = new SmsService({
          fast2smsConfig: { apiKey: 'test_fast2sms_key', route: 'otp' },
        });

        // Test with +91 country code prefix
        const result = await service.sendOtp('+919876543210', '654321');
        assert.equal(result, true);
        assert.equal(requestedUrl, 'https://www.fast2sms.com/dev/bulkV2');
        assert.equal(requestedHeaders.authorization, 'test_fast2sms_key');
        assert.equal(requestedBody.route, 'otp');
        assert.equal(requestedBody.variables_values, '654321');
        assert.equal(requestedBody.numbers, '9876543210'); // Clean 10 digits
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('throws BadGatewayError when Fast2SMS returns return: false', async () => {
      const { SmsService } = await import('../src/modules/auth/infrastructure/SmsService.js');
      const originalFetch = globalThis.fetch;

      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({
          return: false,
          message: 'Invalid authorization key',
        }),
      });

      try {
        const service = new SmsService({
          fast2smsConfig: { apiKey: 'invalid_key', route: 'otp' },
        });

        await assert.rejects(
          async () => {
            await service.sendOtp('9876543210', '123456');
          },
          {
            name: 'BadGatewayError',
            statusCode: 502,
          }
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});

