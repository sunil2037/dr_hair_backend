import { BadRequestError, ConflictError, NotFoundError } from '../../../shared/errors/index.js';
import { sendSuccess } from '../../../shared/utils/response.js';
import { sendPushNotification } from '../../notifications/infrastructure/FirebaseAdminMessaging.js';

const appointmentStatuses = ['Requested', 'Confirmed', 'Arrived', 'In Consultation', 'Completed', 'Cancelled', 'No show'];
const slotMinutes = new Set([0, 30]);

const localParts = (date) => Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).formatToParts(date).map(({ type, value }) => [type, value]));

const normalizeStartsAt = (value) => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw new BadRequestError('starts_at must be a valid ISO date-time.');
  return date.toISOString();
};

const dateKeyFor = (startsAt) => {
  const parts = localParts(new Date(startsAt));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const validateDateKey = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

export class AppointmentController {
  constructor({
    appointmentRepository,
    userRepository,
    patientActivityRepository,
    notificationRepository,
    deviceTokenRepository,
    auditEventRepository,
    paymentGatewayService,
    featureFlagRepository,
  }) {
    this.appointmentRepository = appointmentRepository;
    this.userRepository = userRepository;
    this.patientActivityRepository = patientActivityRepository;
    this.notificationRepository = notificationRepository;
    this.deviceTokenRepository = deviceTokenRepository;
    this.auditEventRepository = auditEventRepository;
    this.paymentGatewayService = paymentGatewayService;
    this.featureFlagRepository = featureFlagRepository;
  }

  getBillingConfig = async () => {
    if (this.featureFlagRepository) {
      try {
        const flag = await this.featureFlagRepository.getFlag('clinic_appointment_billing');
        if (flag) {
          return {
            payment_required: Boolean(flag.enabled),
            consultation_fee: Number(flag.metadata?.consultation_fee ?? 500),
            currency: String(flag.metadata?.currency ?? 'INR'),
            first_appointment_free: Boolean(flag.metadata?.first_appointment_free ?? false),
          };
        }
      } catch (_) {}
    }
    return {
      payment_required: false,
      consultation_fee: 500,
      currency: 'INR',
      first_appointment_free: false,
    };
  };

  getBillingConfigPatient = async (req, res, next) => {
    try {
      const billing = await this.getBillingConfig();
      let isFirstAppointment = true;
      if (req.user?.id) {
        const pastAppointments = await this.appointmentRepository.listByPatient(req.user.id);
        const activeOrCompleted = (pastAppointments || []).filter(
          (apt) => apt.status !== 'Cancelled'
        );
        isFirstAppointment = activeOrCompleted.length === 0;
      }
      const isFirstFree = billing.first_appointment_free && isFirstAppointment;
      const effectiveFee = isFirstFree ? 0 : billing.consultation_fee;
      const effectivePaymentRequired = isFirstFree ? false : billing.payment_required;

      return sendSuccess(res, {
        data: {
          ...billing,
          is_first_appointment: isFirstAppointment,
          effective_fee: effectiveFee,
          effective_payment_required: effectivePaymentRequired,
        },
      });
    } catch (error) { next(error); }
  };

  getBillingConfigAdmin = async (req, res, next) => {
    try {
      const billing = await this.getBillingConfig();
      return sendSuccess(res, { data: billing });
    } catch (error) { next(error); }
  };

  updateBillingConfigAdmin = async (req, res, next) => {
    try {
      if (!this.featureFlagRepository) throw new BadRequestError('Feature flag repository not configured.');
      const payment_required = req.body?.payment_required != null ? Boolean(req.body.payment_required) : false;
      const consultation_fee = req.body?.consultation_fee != null ? Math.max(0, Number(req.body.consultation_fee)) : 500;
      const first_appointment_free = req.body?.first_appointment_free != null ? Boolean(req.body.first_appointment_free) : false;
      const actor = req.user?.email || req.user?.login || 'Super Admin';

      const updated = await this.featureFlagRepository.setFlag('clinic_appointment_billing', {
        title: 'Clinic Appointment Billing',
        description: 'Control whether online payment via Razorpay is required for appointments and set consultation fee.',
        group: 'Appointments',
        enabled: payment_required,
        metadata: { consultation_fee, currency: 'INR', payment_required, first_appointment_free },
        updatedBy: actor,
      });

      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor,
          action: 'appointment_billing.updated',
          target: 'clinic_appointment_billing',
          metadata: { payment_required, consultation_fee, first_appointment_free },
        }).catch(() => null);
      }

      return sendSuccess(res, {
        message: 'Appointment billing settings updated.',
        data: {
          payment_required: Boolean(updated.enabled),
          consultation_fee: Number(updated.metadata?.consultation_fee ?? consultation_fee),
          currency: 'INR',
          first_appointment_free: Boolean(updated.metadata?.first_appointment_free ?? first_appointment_free),
        },
      });
    } catch (error) { next(error); }
  };

  createPaymentIntent = async (req, res, next) => {
    try {
      if (!this.paymentGatewayService) {
        throw new BadRequestError('Payment gateway service is not configured.');
      }
      const starts_at = normalizeStartsAt(req.body?.starts_at);
      await this.validateSlot(starts_at, { patientRequest: true });

      const billing = await this.getBillingConfig();
      let isFirstAppointment = false;
      if (req.user?.id) {
        const list = await this.appointmentRepository.listByPatient(req.user.id);
        const nonCancelled = (list || []).filter((apt) => apt.status !== 'Cancelled');
        isFirstAppointment = nonCancelled.length === 0;
      }
      if (billing.first_appointment_free && isFirstAppointment) {
        throw new BadRequestError('Your first consultation is free! Online payment is not required.');
      }

      const fee = billing.consultation_fee;
      if (fee <= 0 || !billing.payment_required) {
        throw new BadRequestError('Consultation fee is ₹0 or online payment is not required.');
      }

      const patient = await this.userRepository.findById(req.user.id);
      const tempOrderId = `APT-${Date.now()}-${req.user.id}`;

      const intent = await this.paymentGatewayService.createPaymentIntent({
        orderId: tempOrderId,
        amount: fee,
        currency: 'INR',
        customer: {
          name: patient?.name || '',
          email: patient?.email || '',
          phone: patient?.phone || '',
        },
      });

      return sendSuccess(res, {
        data: {
          orderId: intent.intentId,
          intent_id: intent.intentId,
          keyId: intent.keyId || process.env.RAZORPAY_KEY_ID || '',
          key_id: intent.keyId || process.env.RAZORPAY_KEY_ID || '',
          amount: intent.amount,
          amountFormatted: fee,
          currency: intent.currency || 'INR',
          starts_at,
          tempOrderId,
        },
      });
    } catch (error) { next(error); }
  };

  verifyAndBook = async (req, res, next) => {
    try {
      if (!this.paymentGatewayService) {
        throw new BadRequestError('Payment gateway service is not configured.');
      }
      const { starts_at: rawStartsAt, reason: rawReason, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        throw new BadRequestError('Missing Razorpay payment verification details (order ID, payment ID, or signature).');
      }

      const starts_at = normalizeStartsAt(rawStartsAt);
      const reason = String(rawReason || 'Clinic consultation').trim().slice(0, 500);
      await this.validateSlot(starts_at, { patientRequest: true });

      const isValid = this.paymentGatewayService.verifyPaymentSignature({
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
      });

      if (!isValid) {
        throw new BadRequestError('Razorpay payment signature verification failed.');
      }

      const billing = await this.getBillingConfig();
      const fee = billing.consultation_fee;
      const patient = await this.userRepository.findById(req.user.id);
      const actor = patient?.patient_code || 'Patient';

      const appointment = await this.appointmentRepository.create({
        userId: Number(req.user.id),
        patient_code: patient?.patient_code || '',
        starts_at,
        reason,
        consultation_fee: fee,
        payment_status: 'Paid',
        payment_method: 'Razorpay',
        payment_transaction_id: razorpay_payment_id,
        payment_time: new Date(),
        source: 'App',
        status: 'Confirmed',
        status_history: [{
          action: `booked via online payment (₹${fee} Paid via Razorpay · Txn: ${razorpay_payment_id})`,
          status: 'Confirmed',
          changed_by: actor,
          starts_at,
        }],
      });

      await this.patientActivityRepository.record({
        userId: req.user.id,
        patientCode: patient?.patient_code,
        type: 'appointment',
        title: 'Appointment booked (Paid)',
        summary: `${reason} · ${starts_at} · ₹${fee} Paid via Razorpay (${razorpay_payment_id})`,
        actor: 'Patient app',
        metadata: {
          appointment_id: appointment.id,
          opd_token: appointment.opd_token,
          transaction_id: razorpay_payment_id,
        },
      });

      if (this.notificationRepository) {
        try {
          const notif = await this.notificationRepository.create({
            userId: Number(req.user.id),
            title: 'Appointment Confirmed & Paid',
            body: `Your clinic sitting for ${reason} is confirmed (Token #${appointment.opd_token || '1'}). Payment of ₹${fee} received.`,
            type: 'appointment',
            destination: {
              type: 'screen',
              screen: 'clinic_appointment',
              entityId: appointment.id,
            },
            data: {
              appointment_id: appointment.id,
              opd_token: String(appointment.opd_token || ''),
              destination_type: 'screen',
              screen: 'clinic_appointment',
            },
          });

          if (this.deviceTokenRepository) {
            const tokens = await this.deviceTokenRepository.listByUserId(req.user.id);
            for (const { token } of tokens) {
              await sendPushNotification({
                token,
                title: notif.title,
                body: notif.body,
                data: {
                  notification_id: notif.id,
                  destination_type: 'screen',
                  screen: 'clinic_appointment',
                  entity_id: appointment.id,
                },
              }).catch(() => {});
            }
          }
        } catch (_) {}
      }

      return sendSuccess(res, {
        message: 'Appointment confirmed and payment verified successfully.',
        data: this.serialize(appointment, patient),
        statusCode: 201,
      });
    } catch (error) { next(error); }
  };

  validateSlot = async (startsAt, { patientRequest = false, exceptId = '' } = {}) => {
    const date = new Date(startsAt);
    const parts = localParts(date);
    const weekday = parts.weekday;
    const hour = Number(parts.hour);
    const minute = Number(parts.minute);
    const totalMinutes = hour * 60 + minute;
    const allowed = (totalMinutes >= 600 && totalMinutes <= 750 || totalMinutes >= 930 && totalMinutes <= 1110) && slotMinutes.has(minute);
    if (!allowed) throw new BadRequestError('Choose an available clinic sitting slot (10:00 AM–12:30 PM or 3:30 PM–6:30 PM).');
    if (weekday === 'Sun') throw new BadRequestError('The clinic is closed on Sundays. Choose Monday to Saturday.');
    const closedDates = await this.appointmentRepository.listClosedDates();
    if (closedDates.some((item) => item.date === dateKeyFor(startsAt))) throw new BadRequestError('The clinic is closed on this date. Choose another date.');
    if (date.getTime() <= Date.now()) throw new BadRequestError('Choose a future clinic slot.');
    if (patientRequest && date.getTime() > Date.now() + 90 * 24 * 60 * 60 * 1000) throw new BadRequestError('Choose a clinic slot within the next 90 days.');
    if (await this.appointmentRepository.findSlot(startsAt, exceptId)) throw new BadRequestError('This sitting is already booked. Choose another time.');
  };

  serialize = (appointment, patient = null) => {
    const parts = localParts(new Date(appointment.starts_at));
    const hour = Number(parts.hour);
    const time = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }).format(new Date(appointment.starts_at));
    const date = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' }).format(new Date(appointment.starts_at));
    const patientCode = patient?.patient_code || appointment.patient_code || (appointment.userId ? `DHP${String(appointment.userId).padStart(4, '0')}` : '');
    return {
      ...appointment,
      patientId: patientCode || String(appointment.userId || ''),
      patient_code: patientCode,
      customer: patient?.name || 'Patient',
      service: appointment.reason,
      startsAt: appointment.starts_at,
      date: `${date} · ${time}`,
      source: appointment.source,
      type: appointment.type,
      doctorName: appointment.doctor_name,
      room: appointment.room,
      tokenNumber: appointment.opd_token,
      opdStatus: appointment.status,
      consultationFee: appointment.consultation_fee != null ? Number(appointment.consultation_fee) : 500,
      paymentStatus: appointment.payment_status || 'Pending',
      paymentMethod: appointment.payment_method || 'UPI',
      paymentTransactionId: appointment.payment_transaction_id || '',
      paymentTime: appointment.payment_time ? new Date(appointment.payment_time).toISOString() : null,
      _clinicHour: hour,
    };
  };

  serializeMany = async (items) => {
    const patients = await this.userRepository.findByIds(items.map((item) => item.userId));
    const byId = new Map(patients.map((patient) => [Number(patient.id), patient]));
    return items.map((item) => this.serialize(item, byId.get(Number(item.userId))));
  };

  listPatient = async (req, res, next) => {
    try {
      const items = await this.appointmentRepository.listByPatient(req.user.id);
      const serialized = await this.serializeMany(items);
      return sendSuccess(res, { data: { items: serialized } });
    } catch (error) { next(error); }
  };

  createPatient = async (req, res, next) => {
    try {
      const starts_at = normalizeStartsAt(req.body?.starts_at);
      const reason = String(req.body?.reason || '').trim();
      if (!reason || reason.length > 500) throw new BadRequestError('reason is required and must be at most 500 characters.');
      await this.validateSlot(starts_at, { patientRequest: true });
      const patient = await this.userRepository.findById(req.user.id);
      const actor = patient?.patient_code || 'Patient';

      const billing = await this.getBillingConfig();
      let isFirstAppointment = false;
      if (req.user?.id) {
        const list = await this.appointmentRepository.listByPatient(req.user.id);
        const nonCancelled = (list || []).filter((apt) => apt.status !== 'Cancelled');
        isFirstAppointment = nonCancelled.length === 0;
      }
      const isFirstAppointmentFree = billing.first_appointment_free && isFirstAppointment;
      const isOnlineRequired = billing.payment_required && !isFirstAppointmentFree;

      if (isOnlineRequired) {
        throw new BadRequestError('Online payment is required to book an appointment. Please complete Razorpay checkout.');
      }

      const consultation_fee = isFirstAppointmentFree ? 0 : billing.consultation_fee;

      // Block unverified client-supplied 'Paid' status unless waived for free consultation
      if (req.body?.payment_status === 'Paid') {
        throw new BadRequestError('Online payment verification is not yet integrated for direct requests. In-clinic appointments must be requested as Pending (Pay at clinic).');
      }

      const payment_method = isFirstAppointmentFree
        ? 'Free First Consultation'
        : String(req.body?.payment_method || 'Pay at clinic').trim();
      const payment_status = isFirstAppointmentFree ? 'Waived' : 'Pending';
      const payment_transaction_id = null;

      const appointment = await this.appointmentRepository.create({
        userId: Number(req.user.id),
        patient_code: patient?.patient_code || '',
        starts_at,
        reason,
        consultation_fee,
        payment_status,
        payment_method,
        payment_transaction_id,
        source: 'App',
        status: 'Requested',
        status_history: [{
          action: `requested from patient app (fee: ₹${consultation_fee}, ${payment_status} via ${payment_method})`,
          status: 'Requested',
          changed_by: actor,
          starts_at,
        }],
      });
      await this.patientActivityRepository.record({
        userId: req.user.id,
        patientCode: patient?.patient_code,
        type: 'appointment',
        title: 'Appointment requested',
        summary: `${reason} · ${starts_at} · ₹${consultation_fee} (${payment_status})`,
        actor: 'Patient app',
        metadata: { appointment_id: appointment.id, opd_token: appointment.opd_token },
      });

      // Automated push & in-app notification trigger for appointment booking
      if (this.notificationRepository) {
        try {
          const notif = await this.notificationRepository.create({
            userId: Number(req.user.id),
            title: 'Appointment Booked Successfully',
            body: `Your clinic sitting for ${reason} is confirmed (Token #${appointment.opd_token || '1'}). Tap to view details.`,
            type: 'appointment',
            destination: {
              type: 'screen',
              screen: 'clinic_appointment',
              entityId: appointment.id,
            },
            data: {
              appointment_id: appointment.id,
              opd_token: String(appointment.opd_token || ''),
              destination_type: 'screen',
              screen: 'clinic_appointment',
            },
          });

          if (this.deviceTokenRepository) {
            const tokens = await this.deviceTokenRepository.listByUserId(req.user.id);
            for (const { token } of tokens) {
              await sendPushNotification({
                token,
                title: notif.title,
                body: notif.body,
                data: {
                  notification_id: notif.id,
                  destination_type: 'screen',
                  screen: 'clinic_appointment',
                  entity_id: appointment.id,
                },
              }).catch(() => {});
            }
          }
        } catch (_) {}
      }

      return sendSuccess(res, { message: 'Appointment request sent to the clinic.', data: this.serialize(appointment, patient), statusCode: 201 });
    } catch (error) { next(error); }
  };

  updatePatient = async (req, res, next) => {
    try {
      const appointment = await this.appointmentRepository.findById(req.params.appointmentId, req.user.id);
      if (!appointment) throw new NotFoundError('Appointment request not found.');
      if (['Completed', 'Cancelled', 'No show'].includes(appointment.status)) throw new BadRequestError('This appointment can no longer be changed.');
      const action = req.body?.action;
      let patch;
      let event;
      if (action === 'cancel') {
        patch = { status: 'Cancelled' };
        event = { action: 'cancelled by patient', status: 'Cancelled', changed_by: appointment.patient_code || 'Patient' };
      } else if (action === 'reschedule') {
        const starts_at = normalizeStartsAt(req.body?.starts_at);
        await this.validateSlot(starts_at, { patientRequest: true, exceptId: appointment.id });
        patch = { starts_at, status: 'Requested' };
        event = { action: 'rescheduled by patient', status: 'Requested', starts_at, changed_by: appointment.patient_code || 'Patient' };
      } else throw new BadRequestError('action must be cancel or reschedule.');
      const updated = await this.appointmentRepository.update(appointment.id, patch, event, req.user.id);
      await this.patientActivityRepository.record({ userId: req.user.id, patientCode: appointment.patient_code, type: 'appointment', title: action === 'cancel' ? 'Appointment cancelled' : 'Appointment rescheduled', summary: patch.starts_at || appointment.starts_at, actor: 'Patient app', metadata: { appointment_id: appointment.id } });
      const patient = await this.userRepository.findById(appointment.userId);
      return sendSuccess(res, { message: action === 'cancel' ? 'Appointment request cancelled.' : 'Reschedule request sent to the clinic.', data: this.serialize(updated, patient) });
    } catch (error) { next(error); }
  };

  listAdmin = async (req, res, next) => {
    try {
      const items = await this.appointmentRepository.list({ from: req.query.from, to: req.query.to, status: req.query.status, limit: req.query.limit });
      return sendSuccess(res, { data: { items: await this.serializeMany(items) } });
    } catch (error) { next(error); }
  };

  createAdmin = async (req, res, next) => {
    try {
      const patientId = req.body?.patient_id || req.body?.patient_code;
      const patient = await this.userRepository.findById(patientId);
      if (!patient || patient.role !== 'user') throw new NotFoundError('Patient not found.');
      const starts_at = normalizeStartsAt(req.body?.starts_at);
      await this.validateSlot(starts_at);
      const reason = String(req.body?.reason || 'Clinic consultation').trim().slice(0, 500);
      const actor = String(req.user?.email || req.user?.login || 'Clinic admin');
      const appointment = await this.appointmentRepository.create({
        userId: Number(patient.id), patient_code: patient.patient_code, starts_at, reason,
        source: ['App', 'Phone', 'WhatsApp', 'Reception'].includes(req.body?.source) ? req.body.source : 'Reception',
        status: 'Confirmed',
        status_history: [{ action: 'scheduled by clinic', status: 'Confirmed', changed_by: actor, starts_at }],
      });
      await this.patientActivityRepository.record({ userId: patient.id, patientCode: patient.patient_code, type: 'appointment', title: 'Clinic appointment scheduled', summary: `${reason} · ${starts_at}`, actor, metadata: { appointment_id: appointment.id } });
      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor,
          action: 'appointment.created',
          target: `appointment:${appointment.id}`,
          metadata: { patient_id: patient.id, starts_at, reason },
        }).catch(() => null);
      }
      return sendSuccess(res, { message: 'Clinic appointment scheduled.', data: this.serialize(appointment, patient), statusCode: 201 });
    } catch (error) { next(error); }
  };

  updateAdmin = async (req, res, next) => {
    try {
      const appointment = await this.appointmentRepository.findById(req.params.appointmentId);
      if (!appointment) throw new NotFoundError('Appointment not found.');
      const actor = String(req.user?.email || req.user?.login || 'Clinic admin');
      const body = req.body || {};
      let patch = {};
      let event = null;
      if (body.action === 'reschedule') {
        const starts_at = normalizeStartsAt(body.starts_at);
        await this.validateSlot(starts_at, { exceptId: appointment.id });
        patch = { starts_at, status: 'Confirmed' };
        event = { action: 'rescheduled by clinic', status: 'Confirmed', starts_at, changed_by: actor };
      } else if (body.status && appointmentStatuses.includes(body.status)) {
        const allowedNext = {
          Requested: ['Confirmed', 'Cancelled'],
          Confirmed: ['Arrived', 'In Consultation', 'Completed', 'Cancelled', 'No show'],
          Arrived: ['In Consultation', 'Completed', 'Cancelled', 'No show'],
          'In Consultation': ['Completed'],
          Completed: [],
          Cancelled: [],
          'No show': [],
        };
        if (!allowedNext[appointment.status]?.includes(body.status)) {
          throw new BadRequestError(`Appointment status cannot move from ${appointment.status} to ${body.status}.`);
        }
        if (body.status === 'No show' && new Date(appointment.starts_at).getTime() > Date.now()) throw new BadRequestError('A future appointment cannot be marked as no show.');
        patch.status = body.status;
        event = { action: `status changed to ${body.status}`, status: body.status, changed_by: actor };
      } else if (!body.payment_status) {
        throw new BadRequestError('Provide a valid appointment status, payment_status, or action=reschedule.');
      }

      if (body.payment_status) {
        if (!['Pending', 'Paid', 'Refunded', 'Waived'].includes(body.payment_status)) {
          throw new BadRequestError('payment_status must be Pending, Paid, Refunded, or Waived.');
        }
        patch.payment_status = body.payment_status;
        if (body.payment_status === 'Paid') {
          patch.payment_time = new Date();
        }
        const payAction = `payment marked ${body.payment_status}`;
        event = event
          ? { ...event, action: `${event.action} · ${payAction}` }
          : { action: payAction, status: appointment.status, changed_by: actor };
      }
      const updated = await this.appointmentRepository.update(appointment.id, patch, event);
      await this.patientActivityRepository.record({ userId: appointment.userId, patientCode: appointment.patient_code, type: 'appointment', title: event.action, summary: patch.starts_at || appointment.starts_at, actor, metadata: { appointment_id: appointment.id } });
      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor,
          action: body.action === 'reschedule' ? 'appointment.rescheduled' : 'appointment.updated',
          target: `appointment:${appointment.id}`,
          metadata: { status: updated.status, payment_status: updated.payment_status, starts_at: updated.starts_at },
        }).catch(() => null);
      }
      const patient = await this.userRepository.findById(appointment.userId);
      return sendSuccess(res, { message: 'Appointment updated.', data: this.serialize(updated, patient) });
    } catch (error) { next(error); }
  };

  listClosedDates = async (_req, res, next) => {
    try { return sendSuccess(res, { data: { items: await this.appointmentRepository.listClosedDates() } }); }
    catch (error) { next(error); }
  };

  createClosedDate = async (req, res, next) => {
    try {
      const date = String(req.body?.date || '');
      if (!validateDateKey(date)) throw new BadRequestError('date must use YYYY-MM-DD format.');
      const existingAppointments = await this.appointmentRepository.listActiveByClinicDate(date);
      if (existingAppointments.length) {
        throw new ConflictError('Move or cancel the scheduled appointments before closing this date.', {
          appointments: existingAppointments.map(({ id, patient_code, starts_at, status }) => ({ id, patient_code, starts_at, status })),
        });
      }
      const actor = String(req.user?.email || req.user?.login || 'Clinic admin');
      const record = await this.appointmentRepository.addClosedDate({ date, reason: String(req.body?.reason || '').trim().slice(0, 200), created_by: actor });
      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor,
          action: 'clinic_availability.closed',
          target: `date:${date}`,
          metadata: { date, reason: req.body?.reason },
        }).catch(() => null);
      }
      return sendSuccess(res, { message: 'Clinic date closed for new appointments.', data: record, statusCode: 201 });
    } catch (error) { next(error); }
  };

  deleteClosedDate = async (req, res, next) => {
    try {
      if (!validateDateKey(req.params.date)) throw new BadRequestError('date must use YYYY-MM-DD format.');
      const removed = await this.appointmentRepository.removeClosedDate(req.params.date);
      if (!removed) throw new NotFoundError('Closed date not found.');
      const actor = String(req.user?.email || req.user?.login || 'Clinic admin');
      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor,
          action: 'clinic_availability.reopened',
          target: `date:${req.params.date}`,
          metadata: { date: req.params.date },
        }).catch(() => null);
      }
      return sendSuccess(res, { message: 'Clinic date reopened for new appointments.' });
    } catch (error) { next(error); }
  };
}
