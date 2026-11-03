import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createContainer } from '../src/container.js';
import { store } from '../src/shared/database/store.js';
import { TokenService } from '../src/shared/utils/token.service.js';
import { authenticateToken } from '../src/shared/middlewares/auth.middleware.js';
import { hashPassword } from '../src/shared/utils/password-hasher.js';

describe('Admin User Block, Delete & Mobile App Access Safeguards', () => {
  let container;
  let adminController;
  let userRepository;
  let sessionRepository;
  let auditRepo;
  let superAdminUser;
  let regularAdminUser;
  let testPatient;

  beforeEach(async () => {
    store.users = [];
    store.sessions = [];
    store.auditEvents = [];
    store.adminAccounts = [];

    container = createContainer();
    adminController = container.controllers.adminController;
    userRepository = container.repositories.userRepository;
    sessionRepository = container.repositories.sessionRepository;
    auditRepo = container.repositories.auditEventRepository;

    // Seed Super Admin
    superAdminUser = {
      id: 'admin_1',
      name: 'Super Administrator',
      email: 'superadmin@drhair.in',
      role: 'super_admin',
    };

    // Seed Regular Admin
    regularAdminUser = {
      id: 'admin_2',
      name: 'Dr. Clinical',
      email: 'clinical@drhair.in',
      role: 'admin',
    };

    // Seed Patient User
    testPatient = await userRepository.create({
      name: 'Rohan Verma',
      email: 'rohan@example.com',
      phone: '9876500001',
      age: 29,
      gender: 'Male',
      city: 'Delhi',
    });
  });

  it('Super Admin blocks patient user and revokes active sessions', async () => {
    // Create an active session for the patient
    const session = await sessionRepository.create({
      userId: testPatient.id,
      userType: 'patient',
    });

    const mockReq = {
      params: { userId: testPatient.id },
      body: { is_blocked: true, reason: 'Suspicious consultation activity' },
      user: superAdminUser,
    };

    let responseData = null;
    const mockRes = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        responseData = payload;
        return this;
      },
    };

    await adminController.setUserStatus(mockReq, mockRes, (err) => {
      if (err) throw err;
    });

    assert.equal(responseData.status, 'success');
    assert.equal(responseData.message, 'Patient account has been blocked.');
    assert.equal(responseData.data.is_blocked, true);
    assert.equal(responseData.data.status, 'blocked');

    // Verify database state
    const updatedUser = await userRepository.findById(testPatient.id);
    assert.equal(updatedUser.is_blocked, true);
    assert.equal(updatedUser.status, 'blocked');
    assert.equal(updatedUser.blocked_reason, 'Suspicious consultation activity');
    assert.ok(updatedUser.blocked_at);

    // Verify active session was revoked
    const activeSession = await sessionRepository.findActive(session.sessionId);
    assert.equal(activeSession, null);

    // Verify audit event was logged
    const auditEvents = await auditRepo.list({ limit: 10 });
    const blockEvent = auditEvents.items.find((e) => e.action === 'user.blocked');
    assert.ok(blockEvent);
    assert.equal(blockEvent.actor, 'Super Administrator');
  });

  it('Blocked patient cannot verify OTP and receives unblock guidance', async () => {
    // Block the patient
    await userRepository.setStatus(testPatient.id, { is_blocked: true, status: 'blocked' });

    // Try to login via VerifyOtpUseCase with mock SMS
    const sentCodes = new Map();
    const mockSms = {
      async sendOtp(dest, code) {
        sentCodes.set(dest, code);
        return true;
      },
    };
    const testContainer = createContainer({ smsService: mockSms, userRepository });
    const cleanPhone = '9876500001';
    await testContainer.useCases.sendOtpUseCase.execute({ login: cleanPhone });
    const code = sentCodes.get(cleanPhone);

    await assert.rejects(
      async () => {
        await testContainer.useCases.verifyOtpUseCase.execute({ login: cleanPhone, otp: code });
      },
      (err) => {
        assert.equal(err.name, 'ForbiddenError');
        assert.equal(err.code, 'ACCOUNT_BLOCKED');
        assert.ok(err.message.includes('contact Dr. Hair Clinic Support'));
        assert.ok(err.details?.support_email);
        assert.ok(err.details?.support_phone);
        return true;
      },
    );
  });

  it('authenticateToken rejects blocked patient with 403 ACCOUNT_BLOCKED', async () => {
    const token = TokenService.generateAccessToken({
      id: testPatient.id,
      name: testPatient.name,
      role: 'user',
    });

    // Block patient
    await userRepository.setStatus(testPatient.id, { is_blocked: true, status: 'blocked' });

    const req = {
      headers: { authorization: `Bearer ${token}` },
    };
    const res = {};

    let errorResult = null;
    await authenticateToken(req, res, (err) => {
      errorResult = err;
    });

    assert.ok(errorResult);
    assert.equal(errorResult.name, 'ForbiddenError');
    assert.equal(errorResult.code, 'ACCOUNT_BLOCKED');
    assert.ok(errorResult.message.includes('contact Dr. Hair Clinic Support'));
    assert.equal(errorResult.details?.support_phone, '+91-9876543210');
  });

  it('Super Admin unblocks patient and user can access APIs again', async () => {
    // Block first
    await userRepository.setStatus(testPatient.id, { is_blocked: true, status: 'blocked' });

    const mockReq = {
      params: { userId: testPatient.id },
      body: { is_blocked: false },
      user: superAdminUser,
    };

    let responseData = null;
    const mockRes = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        responseData = payload;
        return this;
      },
    };

    await adminController.setUserStatus(mockReq, mockRes, (err) => {
      if (err) throw err;
    });

    assert.equal(responseData.status, 'success');
    assert.equal(responseData.message, 'Patient account has been unblocked.');
    assert.equal(responseData.data.is_blocked, false);
    assert.equal(responseData.data.status, 'active');

    // Token should now pass authenticateToken
    const token = TokenService.generateAccessToken({
      id: testPatient.id,
      name: testPatient.name,
      role: 'user',
    });

    const req = {
      headers: { authorization: `Bearer ${token}` },
    };
    let errorResult = null;
    await authenticateToken(req, {}, (err) => {
      errorResult = err;
    });

    assert.equal(errorResult, undefined);
    assert.equal(req.user.id, testPatient.id);
  });

  it('Super Admin deletes patient account permanently and token is rejected with ACCOUNT_DELETED', async () => {
    const token = TokenService.generateAccessToken({
      id: testPatient.id,
      name: testPatient.name,
      role: 'user',
    });

    const mockReq = {
      params: { userId: testPatient.id },
      user: superAdminUser,
    };

    let responseData = null;
    const mockRes = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        responseData = payload;
        return this;
      },
    };

    await adminController.deleteUser(mockReq, mockRes, (err) => {
      if (err) throw err;
    });

    assert.equal(responseData.status, 'success');
    assert.equal(responseData.message, 'Patient account has been permanently deleted.');

    // User is no longer in database
    const foundUser = await userRepository.findById(testPatient.id);
    assert.equal(foundUser, null);

    // Old token used against authenticateToken fails with ACCOUNT_DELETED
    const req = {
      headers: { authorization: `Bearer ${token}` },
    };
    let errorResult = null;
    await authenticateToken(req, {}, (err) => {
      errorResult = err;
    });

    assert.ok(errorResult);
    assert.equal(errorResult.name, 'UnauthorizedError');
    assert.equal(errorResult.code, 'ACCOUNT_DELETED');
    assert.ok(errorResult.message.includes('deleted by clinic administration'));
  });
});
