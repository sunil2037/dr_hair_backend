import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createContainer } from '../src/container.js';
import { store } from '../src/shared/database/store.js';
import { AdminAuthUseCase } from '../src/modules/admin/application/AdminAuthUseCase.js';
import { hashPassword } from '../src/shared/utils/password-hasher.js';

describe('Phase 6: Admin Platform Controls, Aggregates, Flags & Audits', () => {
  let container;
  let adminController;
  let adminAccountRepo;
  let featureFlagRepo;
  let appReleasePolicyRepo;
  let auditRepo;
  let userRepo;
  let appointmentRepo;
  let superAdmin;
  let regularAdmin;

  beforeEach(async () => {
    // Reset stores
    store.adminAccounts = [];
    store.sessions = [];
    store.auditEvents = [];
    store.users = [];
    store.appointments = [];

    container = createContainer();
    adminController = container.controllers.adminController;
    adminAccountRepo = container.repositories.adminAccountRepository;
    featureFlagRepo = container.repositories.featureFlagRepository;
    appReleasePolicyRepo = container.repositories.appReleasePolicyRepository;
    auditRepo = container.repositories.auditEventRepository;
    userRepo = container.repositories.userRepository;
    appointmentRepo = container.repositories.appointmentRepository;

    // Seed Super Admin
    const superAdminPassword = await hashPassword('SuperSecret123!');
    superAdmin = await adminAccountRepo.create({
      name: 'Super Admin',
      email: 'superadmin@drhair.in',
      passwordHash: superAdminPassword,
      role: 'super_admin',
      roleTemplate: 'super-admin',
      permissions: ['*'],
      active: true,
    });

    // Seed Regular Clinical Admin
    const regularPassword = await hashPassword('DoctorSecret123!');
    regularAdmin = await adminAccountRepo.create({
      name: 'Dr. Clinical',
      email: 'clinical@drhair.in',
      passwordHash: regularPassword,
      role: 'clinical-admin',
      roleTemplate: 'clinical-admin',
      permissions: ['patients.view', 'patients.edit', 'clinical.reports.manage', 'appointments.view', 'analytics.view'],
      active: true,
    });
  });

  describe('1. Admin Account Lifecycle & Role Overrides', () => {
    it('super admin invites a new admin with role template and custom permissions', async () => {
      const mockReq = {
        user: { id: superAdmin.id, email: superAdmin.email, role: 'super_admin', permissions: ['*'] },
        body: {
          name: 'Support Operator',
          email: 'support@drhair.in',
          roleTemplate: 'hair-test-operator',
          permissions: ['hair_tests.view', 'hair_tests.review'],
        },
      };

      let resultData = null;
      const mockRes = {
        status(code) {
          assert.equal(code, 201);
          return this;
        },
        json(payload) {
          resultData = payload;
          return this;
        },
      };

      await adminController.inviteAdmin(mockReq, mockRes, () => {});

      assert.ok(resultData);
      assert.equal(resultData.status, 'success');
      assert.equal(resultData.data.admin.email, 'support@drhair.in');
      assert.equal(resultData.data.admin.roleTemplate, 'hair-test-operator');
      assert.equal(resultData.data.admin.active, true);
      assert.ok(resultData.data.credentials.password, 'Should return temporary password for first-time onboarding');
      assert.equal(resultData.data.admin.passwordHash, undefined, 'Never expose password hash');

      // Verify effective permissions calculation
      const created = await adminAccountRepo.findByLogin('support@drhair.in');
      assert.ok(created.permissions.includes('hair_tests.view'));
    });

    it('suspending an admin revokes login ability and terminates active sessions', async () => {
      // Suspend regular admin
      const suspendReq = {
        user: { id: superAdmin.id, email: superAdmin.email, role: 'super_admin', permissions: ['*'] },
        params: { id: regularAdmin.id },
        body: { status: 'suspended' },
      };

      let suspendResData = null;
      const mockRes = {
        status(code) {
          assert.equal(code, 200);
          return this;
        },
        json(payload) {
          suspendResData = payload;
          return this;
        },
      };

      await adminController.setAdminStatus(suspendReq, mockRes, () => {});
      assert.equal(suspendResData.data.active, false);

      // Try logging in as suspended admin
      const adminAuthUseCase = new AdminAuthUseCase({ adminAccountRepository: adminAccountRepo });
      await assert.rejects(
        async () => {
          await adminAuthUseCase.execute({ email: 'clinical@drhair.in', password: 'DoctorSecret123!' });
        },
        (err) => {
          assert.equal(err.name, 'UnauthorizedError');
          return true;
        }
      );

      // Reactivate admin
      const reactivateReq = {
        user: { id: superAdmin.id, email: superAdmin.email, role: 'super_admin', permissions: ['*'] },
        params: { id: regularAdmin.id },
        body: { status: 'active' },
      };
      await adminController.setAdminStatus(reactivateReq, mockRes, () => {});

      const activeLogin = await adminAuthUseCase.execute({ email: 'clinical@drhair.in', password: 'DoctorSecret123!' });
      assert.ok(activeLogin.token, 'Should successfully authenticate after reactivation');
    });

    it('super admin can rotate password for an admin account', async () => {
      const rotateReq = {
        user: { id: superAdmin.id, email: superAdmin.email, role: 'super_admin', permissions: ['*'] },
        params: { id: regularAdmin.id },
        body: { newPassword: 'NewDoctorPassword2026!' },
      };

      let rotateResData = null;
      const mockRes = {
        status(code) {
          assert.equal(code, 200);
          return this;
        },
        json(payload) {
          rotateResData = payload;
          return this;
        },
      };

      await adminController.rotateAdminPassword(rotateReq, mockRes, () => {});
      assert.equal(rotateResData.status, 'success');

      // Verify login with old password fails
      const adminAuthUseCase = new AdminAuthUseCase({ adminAccountRepository: adminAccountRepo });
      await assert.rejects(
        async () => {
          await adminAuthUseCase.execute({ email: 'clinical@drhair.in', password: 'DoctorSecret123!' });
        },
        (err) => err.name === 'UnauthorizedError'
      );

      // Login with new password succeeds
      const newLogin = await adminAuthUseCase.execute({ email: 'clinical@drhair.in', password: 'NewDoctorPassword2026!' });
      assert.ok(newLogin.token);
    });
  });

  describe('2. Dashboard Summaries from Real Aggregate Repositories', () => {
    it('aggregates live counts for patients, appointments, tests, and catalog', async () => {
      // Seed test data
      await userRepo.create({ phone: '9876543210', name: 'Patient 1', isRegistered: true });
      await userRepo.create({ phone: '9876543211', name: 'Patient 2', isRegistered: true });

      const today = new Date().toISOString().split('T')[0];
      await appointmentRepo.create({
        patient_id: 'usr_1',
        patient_name: 'Patient 1',
        phone: '9876543210',
        starts_at: `${today}T10:00:00.000Z`,
        time_slot: '10:00 AM - 10:30 AM',
        status: 'Confirmed',
        consultation_fee: 500,
        payment_status: 'Paid',
      });
      await appointmentRepo.create({
        patient_id: 'usr_2',
        patient_name: 'Patient 2',
        phone: '9876543211',
        starts_at: `${today}T11:00:00.000Z`,
        time_slot: '11:00 AM - 11:30 AM',
        status: 'Pending',
        consultation_fee: 500,
        payment_status: 'Pending',
      });

      const mockReq = {
        user: { id: superAdmin.id, permissions: ['*'] },
      };

      let summaryData = null;
      const mockRes = {
        status(code) {
          assert.equal(code, 200);
          return this;
        },
        json(payload) {
          summaryData = payload;
          return this;
        },
      };

      await adminController.getDashboardSummary(mockReq, mockRes, () => {});

      assert.ok(summaryData);
      assert.equal(summaryData.status, 'success');
      assert.ok(summaryData.data.patients.total >= 2, 'Should count registered patients');
      assert.equal(summaryData.data.appointments.today, 2);
      assert.equal(summaryData.data.appointments.pending, 1);
      assert.equal(summaryData.data.appointments.confirmed, 1);
      assert.ok(Array.isArray(summaryData.data.recentActivity));
    });
  });

  describe('3. Feature Flags & App Release Policies', () => {
    it('retrieves evaluated app config and version requirements for mobile apps', async () => {
      const mockReq = {
        query: {
          platform: 'android',
          version: '1.2.0',
        },
      };

      let configData = null;
      const mockRes = {
        status(code) {
          assert.equal(code, 200);
          return this;
        },
        json(payload) {
          configData = payload;
          return this;
        },
      };

      await adminController.getAppConfig(mockReq, mockRes, () => {});

      assert.ok(configData);
      assert.equal(configData.status, 'success');
      assert.ok(configData.data.features);
      assert.equal(typeof configData.data.features.assessment, 'boolean');
      assert.ok(configData.data.versionCheck);
      assert.equal(configData.data.platform, 'android');
      assert.equal(typeof configData.data.versionCheck.updateRequired, 'boolean');
    });

    it('enforces minVersion and forceUpdate when client version is below threshold', async () => {
      // Set release policy for ios
      await appReleasePolicyRepo.setPolicy('ios', {
        minVersion: '2.0.0',
        latestVersion: '2.1.0',
        forceUpdate: true,
        maintenanceMode: false,
      });

      const mockReq = {
        query: {
          platform: 'ios',
          version: '1.5.0',
        },
      };

      let configData = null;
      const mockRes = {
        status(code) {
          assert.equal(code, 200);
          return this;
        },
        json(payload) {
          configData = payload;
          return this;
        },
      };

      await adminController.getAppConfig(mockReq, mockRes, () => {});

      assert.equal(configData.data.versionCheck.updateRequired, true);
      assert.equal(configData.data.versionCheck.forceUpdate, true);
    });

    it('admin updates feature flag rollout percentage and enabled status', async () => {
      const updateReq = {
        user: { id: superAdmin.id, permissions: ['*'] },
        params: { key: 'shop' },
        body: {
          enabled: true,
          rolloutPercentage: 50,
          platform: 'all',
        },
      };

      let updateRes = null;
      const mockRes = {
        status(code) {
          assert.equal(code, 200);
          return this;
        },
        json(payload) {
          updateRes = payload;
          return this;
        },
      };

      await adminController.updateFeatureFlag(updateReq, mockRes, () => {});

      assert.equal(updateRes.status, 'success');
      assert.equal(updateRes.data.key, 'shop');
      assert.equal(updateRes.data.rolloutPercentage, 50);

      // Verify evaluation in repo
      const flag = await featureFlagRepo.findByKey('shop');
      assert.equal(flag.rolloutPercentage, 50);
    });
  });

  describe('4. Redacted Audit Log Search & Export', () => {
    it('searches audit logs with multi-field matching and date range filtering', async () => {
      // Record sample events
      await auditRepo.record({
        actor: superAdmin.email,
        actorId: superAdmin.id,
        action: 'admin.feature_flag.update',
        target: 'feature_flags:shop',
        metadata: { token: 'secret_jwt_token', changes: { enabled: true } },
      });

      const searchReq = {
        user: { id: superAdmin.id, permissions: ['*'] },
        query: {
          query: 'shop',
          action: 'admin.feature_flag.update',
        },
      };

      let searchRes = null;
      const mockRes = {
        status(code) {
          assert.equal(code, 200);
          return this;
        },
        json(payload) {
          searchRes = payload;
          return this;
        },
      };

      await adminController.listAuditLogs(searchReq, mockRes, () => {});

      assert.ok(searchRes.data.items.length >= 1);
      const log = searchRes.data.items[0];
      assert.equal(log.target, 'feature_flags:shop');
      // Ensure redaction
      assert.equal(log.details.token, '[REDACTED]', 'Sensitive token must be redacted');
    });

    it('exports audit logs and automatically records an export audit trail', async () => {
      const exportReq = {
        user: { id: superAdmin.id, email: superAdmin.email, permissions: ['*'] },
        query: { format: 'json' },
      };

      let exportRes = null;
      const mockRes = {
        status(code) {
          assert.equal(code, 200);
          return this;
        },
        json(payload) {
          exportRes = payload;
          return this;
        },
      };

      await adminController.exportAuditLogs(exportReq, mockRes, () => {});

      assert.ok(exportRes.data.items);
      assert.equal(typeof exportRes.data.count, 'number');

      // Verify export audit event was recorded
      const recent = await auditRepo.list({ action: 'audit.exported', limit: 5 });
      assert.ok(recent.items.length >= 1, 'Exporting audit logs must record an audit event');
    });
  });

  describe('5. Operational Exports (Patients & Appointments)', () => {
    it('exports patient records with phone and name while omitting auth secrets', async () => {
      await userRepo.create({ phone: '9988776655', name: 'Export Patient', isRegistered: true });

      const exportReq = {
        user: { id: superAdmin.id, email: superAdmin.email, permissions: ['patients.export', 'super_admin'] },
      };

      let exportRes = null;
      const mockRes = {
        status(code) {
          assert.equal(code, 200);
          return this;
        },
        json(payload) {
          exportRes = payload;
          return this;
        },
      };

      await adminController.exportPatients(exportReq, mockRes, () => {});

      assert.ok(exportRes.data.items);
      const match = exportRes.data.items.find((p) => p.phone === '9988776655');
      assert.ok(match);
      assert.equal(match.name, 'Export Patient');
      assert.equal(match.otp, undefined, 'OTPs must never be exported');
      assert.equal(match.password_hash, undefined, 'Password hashes must never be exported');
      assert.equal(match.passwordHash, undefined, 'Password hashes must never be exported');
    });

    it('exports appointment bookings with status and payment data', async () => {
      const exportReq = {
        user: { id: superAdmin.id, email: superAdmin.email, permissions: ['bookings.manage'] },
      };

      let exportRes = null;
      const mockRes = {
        status(code) {
          assert.equal(code, 200);
          return this;
        },
        json(payload) {
          exportRes = payload;
          return this;
        },
      };

      await adminController.exportAppointments(exportReq, mockRes, () => {});

      assert.ok(exportRes.data.items);
      assert.ok(Array.isArray(exportRes.data.items));
    });
  });
});
