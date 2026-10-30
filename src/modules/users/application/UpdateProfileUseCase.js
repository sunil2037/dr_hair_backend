import { NotFoundError, BadRequestError } from '../../../shared/errors/index.js';

export class UpdateProfileUseCase {
  constructor({ userRepository }) {
    this.userRepository = userRepository;
  }

  async execute({ userId, name, email, contact }) {
    if (!userId) {
      throw new BadRequestError('User ID is required');
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found.');
    }

    const updatePayload = {};
    if (name) updatePayload.name = name.trim();
    if (email) updatePayload.email = email.trim();
    if (contact) updatePayload.phone = contact.trim();

    const updatedUser = await this.userRepository.update(userId, updatePayload);

    return {
      user: updatedUser,
      message: 'Profile updated successfully.',
    };
  }
}

