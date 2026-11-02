import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { SendOtpUseCase } from '../src/modules/auth/application/SendOtpUseCase.js';
import { AuthController } from '../src/modules/auth/presentation/auth.controller.js';

const buildUseCase = ({ environment, exposeTestOtp, defaultOtp }) => {
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
    environment,
    exposeTestOtp,
    defaultOtp,
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

describe('OTP development response contract', () => {
  it('includes the test code only for explicitly enabled local development', async () => {
    const { useCase, captured } = buildUseCase({
      environment: 'development',
      exposeTestOtp: true,
      defaultOtp: '123456',
    });

    const response = await callController(useCase);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.test_otp, '123456');
    assert.equal(captured.code, '123456');
    assert.equal(captured.record.login, '919876543210');
  });

  it('never returns a configured test code in production', async () => {
    const { useCase, captured } = buildUseCase({
      environment: 'production',
      exposeTestOtp: true,
      defaultOtp: '123456',
    });

    const response = await callController(useCase);

    assert.equal(response.statusCode, 200);
    assert.equal(Object.hasOwn(response.body, 'test_otp'), false);
    assert.match(captured.code, /^\d{6}$/);
    assert.notEqual(captured.code, '123456');
  });

  it('does not return a test code unless local exposure is explicitly enabled', async () => {
    const { useCase } = buildUseCase({
      environment: 'development',
      exposeTestOtp: false,
      defaultOtp: '123456',
    });

    const response = await callController(useCase);

    assert.equal(response.statusCode, 200);
    assert.equal(Object.hasOwn(response.body, 'test_otp'), false);
  });

  it('forces the test OTP off for Vercel deployments even if development flags are set', () => {
    const configUrl = new URL('../src/config/env.js', import.meta.url).href;
    const script = `import { config } from '${configUrl}'; process.stdout.write(JSON.stringify({ isDev: config.isDev, defaultOtp: config.otp.defaultOtp, exposeTestOtp: config.otp.exposeTestOtp }));`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'development',
        VERCEL: '1',
        VERCEL_ENV: 'production',
        EXPOSE_TEST_OTP: 'true',
        DEFAULT_TEST_OTP: '123456',
      },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      isDev: false,
      defaultOtp: null,
      exposeTestOtp: false,
    });
  });
});
