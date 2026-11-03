import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createContainer } from '../src/container.js';
import { store } from '../src/shared/database/store.js';
import { requirePermission, requireAnyPermission } from '../src/shared/middlewares/admin.middleware.js';
import { ConflictError, BadRequestError } from '../src/shared/errors/index.js';

const mockResponse = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
};

const getFutureSlot = (daysAhead = 7, hour = '10:30:00') => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  while (d.getDay() === 0) {
    d.setDate(d.getDate() + 1);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return new Date(`${year}-${month}-${day}T${hour}+05:30`).toISOString();
};

describe('Phase 3: Admin Clinical Operations & Concurrency', () => {
  const container = createContainer();
  const { appointmentRepository, userRepository, auditEventRepository, progressCheckInRepository } = container.repositories;
  const { appointmentController, adminController } = container.controllers;

  // Setup test patient in store
  const testPatient = {
    id: 9901,
    name: 'Vikram Joshi',
    phone: '9876549901',
    email: 'vikram.joshi@example.com',
    patient_code: 'DHP9901',
    role: 'user',
  };
  if (!store.users.some((u) => u.id === testPatient.id)) {
    store.users.push(testPatient);
  }

  describe('1. Slot Concurrency & Double-Booking Prevention', () => {
    it('prevents double-booking: concurrent booking of same slot throws ConflictError (409)', async () => {
      const slot = getFutureSlot(10, '11:00:00');

      // First booking succeeds
      const first = await appointmentRepository.create({
        userId: testPatient.id,
        patient_code: testPatient.patient_code,
        starts_at: slot,
        reason: 'Hair thinning review',
        status: 'Confirmed',
      });
      assert.ok(first.id);
      assert.equal(first.starts_at, slot);

      // Concurrent second booking for the exact same slot must throw ConflictError
      await assert.rejects(
        async () => {
          await appointmentRepository.create({
            userId: testPatient.id,
            patient_code: testPatient.patient_code,
            starts_at: slot,
            reason: 'Second conflicting attempt',
            status: 'Confirmed',
          });
        },
        (err) => {
          assert.ok(err instanceof ConflictError);
          assert.equal(err.statusCode, 409);
          return true;
        }
      );
    });

    it('rejects rescheduling to a slot that is already occupied by another patient', async () => {
      const slotA = getFutureSlot(11, '10:30:00');
      const slotB = getFutureSlot(11, '11:00:00');

      const apptA = await appointmentRepository.create({
        userId: testPatient.id,
        patient_code: testPatient.patient_code,
        starts_at: slotA,
        status: 'Confirmed',
      });

      const apptB = await appointmentRepository.create({
        userId: testPatient.id,
        patient_code: testPatient.patient_code,
        starts_at: slotB,
        status: 'Confirmed',
      });

      // Try to reschedule Appt B to Slot A (which is already booked by Appt A)
      await assert.rejects(
        async () => {
          await appointmentRepository.update(apptB.id, { starts_at: slotA }, { action: 'reschedule' });
        },
        (err) => {
          assert.ok(err instanceof ConflictError);
          assert.equal(err.statusCode, 409);
          return true;
        }
      );
    });

    it('frees up slot when appointment is Cancelled, allowing re-booking', async () => {
      const slot = getFutureSlot(12, '11:30:00');

      const appt = await appointmentRepository.create({
        userId: testPatient.id,
        patient_code: testPatient.patient_code,
        starts_at: slot,
        status: 'Confirmed',
      });

      // Cancel appointment
      await appointmentRepository.update(appt.id, { status: 'Cancelled' }, { action: 'cancelled' });

      // Now re-booking the same slot succeeds
      const rebooked = await appointmentRepository.create({
        userId: testPatient.id,
        patient_code: testPatient.patient_code,
        starts_at: slot,
        reason: 'Rebooked after cancellation',
        status: 'Confirmed',
      });
      assert.ok(rebooked.id);
      assert.equal(rebooked.starts_at, slot);
    });
  });

  describe('2. Server-side RBAC and Direct 403 Enforcement', () => {
    it('requirePermission blocks unauthorized admin with 403 and allows authorized admin or super_admin', () => {
      const mw = requirePermission('bookings.manage');

      // Admin without bookings.manage receives 403
      let blockedError = null;
      mw({ user: { role: 'admin', permissions: ['patients.view'] } }, {}, (err) => { blockedError = err; });
      assert.ok(blockedError);
      assert.equal(blockedError.statusCode, 403);
      assert.equal(blockedError.code, 'FORBIDDEN');

      // Admin with bookings.manage succeeds
      let allowed = false;
      mw({ user: { role: 'admin', permissions: ['bookings.manage'] } }, {}, (err) => { if (!err) allowed = true; });
      assert.equal(allowed, true);

      // Super admin succeeds automatically
      let superAllowed = false;
      mw({ user: { role: 'super_admin', permissions: [] } }, {}, (err) => { if (!err) superAllowed = true; });
      assert.equal(superAllowed, true);
    });

    it('requireAnyPermission blocks unauthorized admin with 403 and allows any matching permission', () => {
      const mw = requireAnyPermission('care-plans.edit', 'assessments.review');

      // Admin with neither permission receives 403
      let blockedError = null;
      mw({ user: { role: 'admin', permissions: ['content.edit'] } }, {}, (err) => { blockedError = err; });
      assert.ok(blockedError);
      assert.equal(blockedError.statusCode, 403);

      // Admin with one of the permissions succeeds
      let allowedOne = false;
      mw({ user: { role: 'admin', permissions: ['assessments.review'] } }, {}, (err) => { if (!err) allowedOne = true; });
      assert.equal(allowedOne, true);

      // Super admin succeeds
      let superAllowed = false;
      mw({ user: { role: 'super_admin' } }, {}, (err) => { if (!err) superAllowed = true; });
      assert.equal(superAllowed, true);
    });
  });

  describe('3. Appointment State Transitions & Payment Separation', () => {
    it('enforces valid appointment state machine transitions', async () => {
      const slot = getFutureSlot(14, '15:30:00');
      const appt = await appointmentRepository.create({
        userId: testPatient.id,
        patient_code: testPatient.patient_code,
        starts_at: slot,
        status: 'Requested',
      });

      const res = mockResponse();

      // Requested -> Confirmed (Valid)
      await appointmentController.updateAdmin(
        { params: { appointmentId: appt.id }, body: { status: 'Confirmed' }, user: { email: 'admin@drhair.test' } },
        res,
        (err) => { if (err) throw err; }
      );
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.data.opdStatus, 'Confirmed');

      // Confirmed -> Arrived (Valid)
      await appointmentController.updateAdmin(
        { params: { appointmentId: appt.id }, body: { status: 'Arrived' }, user: { email: 'admin@drhair.test' } },
        res,
        (err) => { if (err) throw err; }
      );
      assert.equal(res.body.data.opdStatus, 'Arrived');

      // Arrived -> In Consultation (Valid)
      await appointmentController.updateAdmin(
        { params: { appointmentId: appt.id }, body: { status: 'In Consultation' }, user: { email: 'admin@drhair.test' } },
        res,
        (err) => { if (err) throw err; }
      );
      assert.equal(res.body.data.opdStatus, 'In Consultation');

      // In Consultation -> Completed (Valid)
      await appointmentController.updateAdmin(
        { params: { appointmentId: appt.id }, body: { status: 'Completed' }, user: { email: 'admin@drhair.test' } },
        res,
        (err) => { if (err) throw err; }
      );
      assert.equal(res.body.data.opdStatus, 'Completed');
    });

    it('rejects invalid state jumps (e.g. Completed -> Confirmed or future No show)', async () => {
      const slot = getFutureSlot(15, '16:00:00');
      const appt = await appointmentRepository.create({
        userId: testPatient.id,
        patient_code: testPatient.patient_code,
        starts_at: slot,
        status: 'Completed',
      });

      // Jump from Completed back to Confirmed must fail
      await assert.rejects(
        async () => {
          await appointmentController.updateAdmin(
            { params: { appointmentId: appt.id }, body: { status: 'Confirmed' }, user: { email: 'admin@drhair.test' } },
            mockResponse(),
            (err) => { if (err) throw err; }
          );
        },
        { name: 'BadRequestError' }
      );

      // Future appointment cannot be marked as No show
      const futureSlot = getFutureSlot(16, '10:00:00');
      const futureAppt = await appointmentRepository.create({
        userId: testPatient.id,
        patient_code: testPatient.patient_code,
        starts_at: futureSlot,
        status: 'Confirmed',
      });
      await assert.rejects(
        async () => {
          await appointmentController.updateAdmin(
            { params: { appointmentId: futureAppt.id }, body: { status: 'No show' }, user: { email: 'admin@drhair.test' } },
            mockResponse(),
            (err) => { if (err) throw err; }
          );
        },
        { name: 'BadRequestError' }
      );
    });

    it('separates payment status from appointment state: marks fee as Paid independently', async () => {
      const slot = getFutureSlot(16, '16:30:00');
      const appt = await appointmentRepository.create({
        userId: testPatient.id,
        patient_code: testPatient.patient_code,
        starts_at: slot,
        status: 'Confirmed',
        payment_status: 'Pending',
      });

      const res = mockResponse();
      await appointmentController.updateAdmin(
        {
          params: { appointmentId: appt.id },
          body: { payment_status: 'Paid' },
          user: { email: 'reception@drhair.test' },
        },
        res,
        (err) => { if (err) throw err; }
      );

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.data.paymentStatus, 'Paid');
      assert.equal(res.body.data.opdStatus, 'Confirmed');
      assert.ok(res.body.data.paymentTime);
    });
  });

  describe('4. Clinic Closed Dates / Holidays Enforcement', () => {
    it('closing a date blocks new appointment bookings on that date', async () => {
      const dateKey = '2026-11-20';
      const slotOnClosedDate = `${dateKey}T10:30:00+05:30`;

      // Close the clinic date
      await appointmentRepository.addClosedDate({ date: dateKey, reason: 'Annual Clinic Renovation' });

      // Attempt to schedule on closed date must fail
      await assert.rejects(
        async () => {
          await appointmentController.createAdmin(
            {
              body: { patient_id: testPatient.id, starts_at: new Date(slotOnClosedDate).toISOString() },
              user: { email: 'admin@drhair.test' },
            },
            mockResponse(),
            (err) => { if (err) throw err; }
          );
        },
        { name: 'BadRequestError' }
      );

      // Reopening date removes closure
      await appointmentRepository.removeClosedDate(dateKey);
    });

    it('closing a date with existing active appointments throws ConflictError (409)', async () => {
      const dateKey = '2026-11-21';
      const slot = `${dateKey}T11:00:00+05:30`;

      // Book an appointment first
      await appointmentRepository.create({
        userId: testPatient.id,
        patient_code: testPatient.patient_code,
        starts_at: new Date(slot).toISOString(),
        status: 'Confirmed',
      });

      // Attempt to close this date must throw ConflictError
      await assert.rejects(
        async () => {
          await appointmentController.createClosedDate(
            { body: { date: dateKey, reason: 'Emergency closure' }, user: { email: 'admin@drhair.test' } },
            mockResponse(),
            (err) => { if (err) throw err; }
          );
        },
        (err) => {
          assert.ok(err instanceof ConflictError);
          assert.equal(err.statusCode, 409);
          return true;
        }
      );
    });
  });

  describe('5. Progress Check-In Clinician Review & Notes', () => {
    it('clinician adds notes and marks daily progress check-in as reviewed', async () => {
      const checkInId = 'CI-TEST-301';
      await progressCheckInRepository.createOnce({
        id: checkInId,
        userId: testPatient.id,
        date: new Date(),
        scalp_region: 'Crown & Vertex',
        shedding_level: 'Mild',
        notes: 'Feeling good, slight shedding on washing',
        density_rating: 4,
        is_doctor_reviewed: false,
        doctor_note: '',
        photos: [],
      });

      const res = mockResponse();
      await adminController.reviewProgressCheckIn(
        {
          params: { userId: testPatient.id, checkInId },
          body: {
            doctor_note: 'Shedding is within normal physiological limits. Continue current topical solution.',
            is_doctor_reviewed: true,
          },
          user: { email: 'dr.bansal@drhair.test' },
        },
        res,
        (err) => { if (err) throw err; }
      );

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.data.item.is_doctor_reviewed, true);
      assert.equal(res.body.data.item.doctor_note, 'Shedding is within normal physiological limits. Continue current topical solution.');

      // Verify audit event was created
      const { items: events } = await auditEventRepository.list({ limit: 20 });
      const reviewedEvent = events.find((e) => e.action === 'progress_checkin.reviewed' && e.metadata?.checkin_id === checkInId);
      assert.ok(reviewedEvent);
      assert.equal(reviewedEvent.actor, 'dr.bansal@drhair.test');
    });
  });

  describe('6. Comprehensive Clinical Audit Trail', () => {
    it('verifies audit event creation for appointment mutations and closed dates', async () => {
      const slot = getFutureSlot(18, '10:00:00');
      const res = mockResponse();

      // Create appointment
      await appointmentController.createAdmin(
        {
          body: { patient_id: testPatient.id, starts_at: slot, reason: 'Audit verification check' },
          user: { email: 'staff@drhair.test' },
        },
        res,
        (err) => { if (err) throw err; }
      );
      const apptId = res.body.data.id;

      // Reschedule appointment
      const newSlot = getFutureSlot(19, '10:30:00');
      await appointmentController.updateAdmin(
        {
          params: { appointmentId: apptId },
          body: { action: 'reschedule', starts_at: newSlot },
          user: { email: 'staff@drhair.test' },
        },
        res,
        (err) => { if (err) throw err; }
      );

      // Verify audit events
      const { items: events } = await auditEventRepository.list({ limit: 50 });
      const createdEvent = events.find((e) => e.action === 'appointment.created' && e.target === `appointment:${apptId}`);
      const rescheduledEvent = events.find((e) => e.action === 'appointment.rescheduled' && e.target === `appointment:${apptId}`);

      assert.ok(createdEvent, 'appointment.created audit event must exist');
      assert.equal(createdEvent.actor, 'staff@drhair.test');

      assert.ok(rescheduledEvent, 'appointment.rescheduled audit event must exist');
      assert.equal(rescheduledEvent.actor, 'staff@drhair.test');
    });
  });
});
