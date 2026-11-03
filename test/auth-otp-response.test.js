import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { SendOtpUseCase } from '../src/modules/auth/application/SendOtpUseCase.js';
import { AuthController } from '../src/modules/auth/presentation/auth.controller.js';

const buildUseCase = () => {
  const captured = { code: null };
  const useCase = new SendOtpUseCase({
    otpRepository: {
      async save(record) {
        captured.record = record;
      },
      async delete() {},
    },
    smsService: {
      async sendOtp(_destination, code) {
        captured.code = code;
      },
    },
    jwtSecret: 'unit-test-jwt-secret-that-is-long-enough',
    expiryMinutes: 10,
  });
  return { useCase, captured };
};

const callController = async (useCase) => {
  const response = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  const controller = new AuthController({
    sendOtpUseCase: useCase,
    verifyOtpUseCase: {},
    userRepository: {},
  });
  await controller.sendLoginOtp({ body: { login: '+91 9876543210' } }, response, (error) => {
    if (error) throw error;
  });
  return response;
};

describe('OTP response contract', () => {
  it('never returns the real OTP in any environment', async () => {
    const { useCase, captured } = buildUseCase();

    const response = await callController(useCase);

    assert.equal(response.statusCode, 200);
    assert.equal(Object.hasOwn(response.body, 'test_otp'), false);
    assert.match(captured.code, /^\d{6}$/);
    assert.equal(captured.record.login, '919876543210');
  });

  it('has no test OTP configuration in Vercel deployments', () => {
    const configUrl = new URL('../src/config/env.js', import.meta.url).href;
    const script = `import { config } from '${configUrl}'; process.stdout.write(JSON.stringify({ isDev: config.isDev, hasDefaultOtp: Object.hasOwn(config.otp, 'defaultOtp'), hasExposeTestOtp: Object.hasOwn(config.otp, 'exposeTestOtp') }));`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'development',
        VERCEL: '1',
        VERCEL_ENV: 'production',
      },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      isDev: false,
      hasDefaultOtp: false,
      hasExposeTestOtp: false,
    });
  });
});
