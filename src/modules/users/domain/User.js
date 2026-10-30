/**
 * User Domain Entity
 */
export class User {
  constructor({
    id,
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
    created_at = new Date(),
    updated_at = new Date(),
  }) {
    this.id = id;
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
    this.created_at = created_at;
    this.updated_at = updated_at;
  }

  toPublicProfile() {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      phone: this.phone,
      age: this.age,
      gender: this.gender,
      city: this.city,
      occupation: this.occupation,
      profile_url: this.profile_url,
    };
  }

  toAuthSession() {
    return {
      id: this.id,
      email: this.email,
      phone: this.phone,
      name: this.name,
    };
  }
}

