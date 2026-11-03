import { BadRequestError } from '../../../shared/errors/index.js';

export class Address {
  constructor({
    id,
    _id,
    userId,
    name,
    phone,
    house_number,
    houseNumber,
    street,
    city,
    state,
    pincode,
    pinCode,
    tag = 'Home',
    is_default = false,
    isDefault = false,
    created_at,
    updated_at,
  }) {
    this.id = id || (_id ? String(_id) : `addr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
    this.userId = String(userId).trim();
    this.name = String(name || '').trim();
    this.phone = String(phone || '').trim();
    this.house_number = String(house_number || houseNumber || '').trim();
    this.street = String(street || '').trim();
    this.city = String(city || '').trim();
    this.state = String(state || '').trim();
    this.pincode = String(pincode || pinCode || '').trim();
    this.tag = ['Home', 'Work', 'Other'].includes(tag) ? tag : 'Home';
    this.is_default = Boolean(is_default ?? isDefault);
    this.created_at = created_at || new Date().toISOString();
    this.updated_at = updated_at || new Date().toISOString();

    this.validate();
  }

  validate() {
    if (!this.userId) throw new BadRequestError('User ID is required for delivery address');
    if (!this.name || this.name.length < 2) throw new BadRequestError('Recipient name is required (min 2 characters)');
    if (!this.phone || this.phone.length < 8) throw new BadRequestError('Valid contact phone is required');
    if (!this.house_number) throw new BadRequestError('House / flat / floor number is required');
    if (!this.street) throw new BadRequestError('Street / locality address is required');
    if (!this.city) throw new BadRequestError('City is required');
    if (!this.state) throw new BadRequestError('State is required');
    if (!this.pincode || !/^\d{6}$/.test(this.pincode)) {
      throw new BadRequestError('Valid 6-digit postal PIN code is required');
    }
  }

  get formattedAddress() {
    return `${this.house_number}, ${this.street}, ${this.city}, ${this.state} - ${this.pincode}`;
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      name: this.name,
      phone: this.phone,
      house_number: this.house_number,
      houseNumber: this.house_number,
      street: this.street,
      city: this.city,
      state: this.state,
      pincode: this.pincode,
      pinCode: this.pincode,
      tag: this.tag,
      is_default: this.is_default,
      isDefault: this.is_default,
      formattedAddress: this.formattedAddress,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }
}
