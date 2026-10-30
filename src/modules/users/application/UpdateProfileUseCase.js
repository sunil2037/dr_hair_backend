import { NotFoundError, BadRequestError, UnauthorizedError } from '../../../shared/errors/index.js';
import { normalizeLogin } from '../../../shared/utils/normalize-login.js';
import { config } from '../../../config/env.js';

const validateProfileUrl = (profileUrl, userId) => {
  if (profileUrl === null) return null;
  if (typeof profileUrl !== 'string' || !profileUrl.trim()) {
    throw new BadRequestError('profile_url must be a Cloudinary URL or null.');
  }

  let parsed;
  try {
    parsed = new URL(profileUrl);
  } catch {
    throw new BadRequestError('profile_url must be a valid Cloudinary URL.');
  }
  const uploadMarker = `/${config.cloudinary.cloudName}/image/upload/`;
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com' || !config.cloudinary.cloudName || !parsed.pathname.includes(uploadMarker)) {
    throw new BadRequestError('profile_url must point to a Dr. Hair Cloudinary image.');
  }

  const uploadedPath = parsed.pathname.split(uploadMarker)[1] || '';
  const pathParts = uploadedPath.split('/').filter(Boolean);
  if (/^v\d+$/.test(pathParts[0] || '')) pathParts.shift();
  const publicId = pathParts.join('/').replace(/\.[a-zA-Z0-9]+$/, '');
  const ownedFolder = `${config.cloudinary.imageFolder}/profiles/user-${userId}/`;
  if (!publicId.startsWith(ownedFolder)) {
    throw new UnauthorizedError('That uploaded profile image does not belong to this account.');
  }
  return profileUrl.trim();
};

export class UpdateProfileUseCase {
  constructor({ userRepository }) {
    this.userRepository = userRepository;
  }

  async execute({ userId, name, email, contact, age, gender, city, occupation, profileUrl, verifiedLogin }) {
    const cleanName = String(name || '').trim();
    const cleanEmail = String(email || '').trim();
    const cleanContact = String(contact || '').trim();
    if (!userId) {
      throw new BadRequestError('User ID is required');
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found.');
    }

    const identity = normalizeLogin(verifiedLogin);
    if (!identity) throw new UnauthorizedError('A verified login is required to update this profile.');
    if (
      cleanEmail
      && normalizeLogin(cleanEmail) !== normalizeLogin(user.email)
      && (!identity.includes('@') || normalizeLogin(cleanEmail) !== identity)
    ) {
      throw new UnauthorizedError('Verify the new email address before changing it.');
    }
    if (
      cleanContact
      && normalizeLogin(cleanContact) !== normalizeLogin(user.phone)
      && (identity.includes('@') || normalizeLogin(cleanContact) !== identity)
    ) {
      throw new UnauthorizedError('Verify the new phone number before changing it.');
    }

    const updatePayload = {};
    if (cleanName) updatePayload.name = cleanName;
    if (cleanEmail) updatePayload.email = cleanEmail;
    if (cleanContact) updatePayload.phone = cleanContact;

    if (typeof age !== 'undefined') {
      const cleanAge = age === null || String(age).trim() === '' ? null : Number(age);
      if (cleanAge !== null && (!Number.isInteger(cleanAge) || cleanAge < 1 || cleanAge > 120)) {
        throw new BadRequestError('Age must be a whole number between 1 and 120.');
      }
      updatePayload.age = cleanAge;
    }
    if (typeof gender !== 'undefined') updatePayload.gender = String(gender || '').trim() || null;
    if (typeof city !== 'undefined') updatePayload.city = String(city || '').trim() || null;
    if (typeof occupation !== 'undefined') updatePayload.occupation = String(occupation || '').trim() || null;
    if (typeof profileUrl !== 'undefined') updatePayload.profile_url = validateProfileUrl(profileUrl, userId);

    if (Object.keys(updatePayload).length === 0) {
      throw new BadRequestError('At least one profile field must be provided.');
    }

    const updatedUser = await this.userRepository.update(userId, updatePayload);

    return {
      user: updatedUser,
      message: 'Profile updated successfully.',
    };
  }
}

