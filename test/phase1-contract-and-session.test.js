import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SessionRepository } from '../src/modules/auth/infrastructure/SessionRepository.js';
import { AuditEventRepository } from '../src/modules/admin/infrastructure/AuditEventRepository.js';
import { getEffectivePermissions, hasPermission } from '../src/shared/utils/admin-permissions.js';
import { requirePermission } from '../src/shared/middlewares/admin.middleware.js';
import { sendSuccess, sendError } from '../src/shared/utils/response.js';
import { UnauthorizedError, ForbiddenError, ValidationError } from '../src/shared/errors/index.js';

describe('Phase 1 - Contract and Session Foundation Tests', () => {
  describe('Standard Response Envelope', () => {
    it('formats successful response with status, data, meta, and error null', () => {
      let sentStatus = null;
      let sentJson = null;
      const res = {
        status(s) { sentStatus = s; return this; },
        json(j) { sentJson = j; return this; },
      };

      sendSuccess(res, {
        data: { id: 'patient_1', name: 'John Doe' },
        meta: { page: 1, total: 1 },
        message: 'Loaded successfully',
      });

      assert.equal(sentStatus, 200);
      assert.equal(sentJson.status, 'success');
      assert.equal(sentJson.error, null);
      assert.equal(sentJson.message, 'Loaded successfully');
      assert.equal(sentJson.data.name, 'John Doe');
      assert.equal(sentJson.meta.total, 1);
    });

    it('formats error response with standardized error object and error codes', () => {
      let sentStatus = null;
      let sentJson = null;
      const res = {
        status(s) { sentStatus = s; return this; },
        json(j) { sentJson = j; return this; },
      };

      sendError(res, {
        message: 'Invalid credentials',
        code: 'AUTH_REQUIRED',
        statusCode: 401,
        details: { field: 'password' },
      });

      assert.equal(sentStatus, 401);
      assert.equal(sentJson.status, 'error');
      assert.equal(sentJson.data, null);
      assert.equal(sentJson.error.code, 'AUTH_REQUIRED');
      assert.equal(sentJson.error.message, 'Invalid credentials');
      assert.equal(sentJson.error.details.field, 'password');
    });

    it('app errors contain correct default error codes', () => {
      const authErr = new UnauthorizedError();
      assert.equal(authErr.statusCode, 401);
      assert.equal(authErr.code, 'AUTH_REQUIRED');

      const forbiddenErr = new ForbiddenError();
      assert.equal(forbiddenErr.statusCode, 403);
      assert.equal(forbiddenErr.code, 'FORBIDDEN');

      const validationErr = new ValidationError();
      assert.equal(validationErr.statusCode, 422);
      assert.equal(validationErr.code, 'VALIDATION_ERROR');
    });
  });

  describe('Session Management & Refresh Token Rotation', () => {
    const sessionRepo = new SessionRepository();

    it('creates active session with hashed refresh token', async () => {
      const created = await sessionRepo.create({
        userId: '12',
        userType: 'patient',
        deviceMetadata: { platform: 'android', ip: '127.0.0.1' },
      });

      assert.ok(created.sessionId.startsWith('ses_'));
      assert.ok(created.refreshToken);
      assert.equal(created.userId, '12');

      const found = await sessionRepo.findActive(created.sessionId);
      assert.ok(found);
      assert.equal(found.revokedAt, null);
      assert.equal(found.userId, '12');
    });

    it('verifies and rotates refresh token, returning fresh token', async () => {
      const created = await sessionRepo.create({ userId: '12', userType: 'patient' });
      const initialRefresh = created.refreshToken;

      const rotated = await sessionRepo.verifyAndRotate({
        sessionId: created.sessionId,
        refreshToken: initialRefresh,
      });

      assert.ok(rotated);
      assert.notEqual(rotated.refreshToken, initialRefresh);

      // Attempting to reuse the old refresh token should fail and revoke session
      const reused = await sessionRepo.verifyAndRotate({
        sessionId: created.sessionId,
        refreshToken: initialRefresh,
      });

      assert.equal(reused, null);

      // Verify session was revoked due to token reuse detection
      const activeAfterReuse = await sessionRepo.findActive(created.sessionId);
      assert.equal(activeAfterReuse, null);
    });

    it('revokes session on user logout', async () => {
      const created = await sessionRepo.create({ userId: '12', userType: 'patient' });
      assert.ok(await sessionRepo.findActive(created.sessionId));

      const revoked = await sessionRepo.revoke(created.sessionId, 'USER_LOGOUT');
      assert.equal(revoked, true);

      const foundAfterLogout = await sessionRepo.findActive(created.sessionId);
      assert.equal(foundAfterLogout, null);
    });

    it('revokes all sessions for account suspension', async () => {
      const s1 = await sessionRepo.create({ userId: '99', userType: 'admin' });
      const s2 = await sessionRepo.create({ userId: '99', userType: 'admin' });

      assert.ok(await sessionRepo.findActive(s1.sessionId));
      assert.ok(await sessionRepo.findActive(s2.sessionId));

      const count = await sessionRepo.revokeAllForUser('99', 'ACCOUNT_SUSPENDED');
      assert.equal(count >= 2, true);

      assert.equal(await sessionRepo.findActive(s1.sessionId), null);
      assert.equal(await sessionRepo.findActive(s2.sessionId), null);
    });
  });

  describe('Server-Side Admin Permissions Enforcement', () => {
    it('super admin inherits all permissions', () => {
      const superAdmin = { role: 'super_admin' };
      assert.equal(hasPermission(superAdmin, 'reports.share'), true);
      assert.equal(hasPermission(superAdmin, 'patients.export'), true);
      assert.equal(hasPermission(superAdmin, 'admins.manage'), true);
    });

    it('clinical-admin role template has patient view and documents, but not commerce', () => {
      const clinicalAdmin = { role: 'admin', roleTemplate: 'clinical-admin' };
      const perms = getEffectivePermissions(clinicalAdmin);

      assert.ok(perms.includes('patients.view'));
      assert.ok(perms.includes('assessments.review'));
      assert.equal(perms.includes('products.manage'), false);
      assert.equal(perms.includes('admins.manage'), false);
    });

    it('custom overrides grant or revoke specific permissions', () => {
      const customAdmin = {
        role: 'admin',
        roleTemplate: 'clinical-admin',
        permissionOverrides: {
          'reports.share': 'allow',
          'documents.upload': 'deny',
        },
      };
      const perms = getEffectivePermissions(customAdmin);
      assert.ok(perms.includes('reports.share'));
      assert.equal(perms.includes('documents.upload'), false);
    });

    it('requirePermission middleware allows authorized and blocks unauthorized with 403', () => {
      const mw = requirePermission('reports.share');

      let blockedError = null;
      const reqUnauthorized = {
        user: { role: 'admin', permissions: ['patients.view'] },
      };
      mw(reqUnauthorized, {}, (err) => { blockedError = err; });

      assert.ok(blockedError);
      assert.equal(blockedError.statusCode, 403);
      assert.equal(blockedError.code, 'FORBIDDEN');

      let allowedNext = false;
      const reqAuthorized = {
        user: { role: 'admin', permissions: ['patients.view', 'reports.share'] },
      };
      mw(reqAuthorized, {}, (err) => { if (!err) allowedNext = true; });
      assert.equal(allowedNext, true);
    });
  });

  describe('Audit Event Persistence', () => {
    const auditRepo = new AuditEventRepository();

    it('records an audit event with actor, target, action and metadata', async () => {
      const event = await auditRepo.record({
        actorId: 'admin_1',
        actorName: 'Dr. Jai Bansal',
        actorEmail: 'dr.hair@admin',
        actorRole: 'super_admin',
        target: 'report:rep_401',
        targetType: 'report',
        action: 'report.share',
        details: { visibility: 'Shared', patientConsent: true },
        ip: '192.168.1.1',
      });

      assert.ok(event.id.startsWith('aud_'));
      assert.equal(event.action, 'report.share');
      assert.equal(event.target, 'report:rep_401');
      assert.equal(event.actorRole, 'super_admin');
    });

    it('lists audit events with pagination and filters', async () => {
      const list = await auditRepo.list({ limit: 10 });
      assert.ok(Array.isArray(list.items));
      assert.ok(list.meta.total >= 1);
    });
  });
});
