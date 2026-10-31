import { BadRequestError, ConflictError, NotFoundError } from '../../../shared/errors/index.js';
import { sendSuccess } from '../../../shared/utils/response.js';

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
  constructor({ appointmentRepository, userRepository, patientActivityRepository }) {
    this.appointmentRepository = appointmentRepository;
    this.userRepository = userRepository;
    this.patientActivityRepository = patientActivityRepository;
  }

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
    return {
      ...appointment,
      patientId: patient?.patient_code || appointment.patient_code || String(appointment.userId),
      patient_code: patient?.patient_code || appointment.patient_code || '',
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
      const appointment = await this.appointmentRepository.create({
        userId: Number(req.user.id), patient_code: patient?.patient_code || '', starts_at, reason,
        source: 'App', status: 'Requested',
        status_history: [{ action: 'requested from patient app', status: 'Requested', changed_by: actor, starts_at }],
      });
      await this.patientActivityRepository.record({ userId: req.user.id, patientCode: patient?.patient_code, type: 'appointment', title: 'Appointment requested', summary: `${reason} · ${starts_at}`, actor: 'Patient app', metadata: { appointment_id: appointment.id } });
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
      return sendSuccess(res, { message: 'Clinic appointment scheduled.', data: this.serialize(appointment, patient), statusCode: 201 });
    } catch (error) { next(error); }
  };

  updateAdmin = async (req, res, next) => {
    try {
      const appointment = await this.appointmentRepository.findById(req.params.appointmentId);
      if (!appointment) throw new NotFoundError('Appointment not found.');
      const actor = String(req.user?.email || req.user?.login || 'Clinic admin');
      const body = req.body || {};
      let patch;
      let event;
      if (body.action === 'reschedule') {
        const starts_at = normalizeStartsAt(body.starts_at);
        await this.validateSlot(starts_at, { exceptId: appointment.id });
        patch = { starts_at, status: 'Confirmed' };
        event = { action: 'rescheduled by clinic', status: 'Confirmed', starts_at, changed_by: actor };
      } else if (appointmentStatuses.includes(body.status)) {
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
        patch = { status: body.status };
        event = { action: `status changed to ${body.status}`, status: body.status, changed_by: actor };
      } else throw new BadRequestError('Provide a valid appointment status or action=reschedule.');
      const updated = await this.appointmentRepository.update(appointment.id, patch, event);
      await this.patientActivityRepository.record({ userId: appointment.userId, patientCode: appointment.patient_code, type: 'appointment', title: event.action, summary: patch.starts_at || appointment.starts_at, actor, metadata: { appointment_id: appointment.id } });
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
      return sendSuccess(res, { message: 'Clinic date closed for new appointments.', data: record, statusCode: 201 });
    } catch (error) { next(error); }
  };

  deleteClosedDate = async (req, res, next) => {
    try {
      if (!validateDateKey(req.params.date)) throw new BadRequestError('date must use YYYY-MM-DD format.');
      const removed = await this.appointmentRepository.removeClosedDate(req.params.date);
      if (!removed) throw new NotFoundError('Closed date not found.');
      return sendSuccess(res, { message: 'Clinic date reopened for new appointments.' });
    } catch (error) { next(error); }
  };
}
