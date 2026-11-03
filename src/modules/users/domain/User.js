import { formatPatientCode } from '../../../shared/utils/patient-code.js';

/**
 * User Domain Entity
 */
export class User {
  constructor({
    id,
    patient_code,
    name,
    email,
    phone,
    age = null,
    gender = null,
    city = null,
    occupation = null,
    platform = 'app',
    profile_url = null,
    role = 'user',
    status = 'active',
    is_blocked = false,
    blocked_at = null,
    blocked_reason = null,
    last_login_at = null,
    created_at = new Date(),
    updated_at = new Date(),
  }) {
    this.id = id;
    this.patient_code = patient_code || formatPatientCode(id);
    this.name = name;
    this.email = email;
    this.phone = phone;
    this.age = age ? parseInt(age, 10) : null;
    this.gender = gender;
    this.city = city;
    this.occupation = occupation;
    this.platform = platform;
    this.profile_url = profile_url;
    this.role = role;
    this.status = status || (is_blocked ? 'blocked' : 'active');
    this.is_blocked = Boolean(is_blocked || status === 'blocked');
    this.blocked_at = blocked_at ? new Date(blocked_at) : null;
    this.blocked_reason = blocked_reason || null;
    this.last_login_at = last_login_at ? new Date(last_login_at) : null;
    this.created_at = created_at;
    this.updated_at = updated_at;
  }

  toPublicProfile() {
    return {
      id: this.id,
      patient_code: this.patient_code,
      name: this.name,
      email: this.email,
      phone: this.phone,
      age: this.age,
      gender: this.gender,
      city: this.city,
      occupation: this.occupation,
      platform: this.platform,
      profile_url: this.profile_url,
      role: this.role,
      status: this.status,
      is_blocked: this.is_blocked,
      blocked_at: this.blocked_at,
      blocked_reason: this.blocked_reason,
      last_login_at: this.last_login_at,
      created_at: this.created_at,
    };
  }

  toAuthSession() {
    return {
      id: this.id,
      patient_code: this.patient_code,
      email: this.email,
      phone: this.phone,
      name: this.name,
    };
  }
}

