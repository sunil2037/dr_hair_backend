import { NotFoundError, BadRequestError, UnauthorizedError } from '../../../shared/errors/index.js';
import { normalizeLogin } from '../../../shared/utils/normalize-login.js';

export class UpdateProfileUseCase {
  constructor({ userRepository }) {
    this.userRepository = userRepository;
  }

  async execute({ userId, name, email, contact, verifiedLogin }) {
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

    const updatedUser = await this.userRepository.update(userId, updatePayload);

    return {
      user: updatedUser,
      message: 'Profile updated successfully.',
    };
  }
}

