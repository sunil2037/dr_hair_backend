import { NotFoundError, BadRequestError } from '../../../shared/errors/index.js';

export class DeleteAccountUseCase {
  constructor({ userRepository }) {
    this.userRepository = userRepository;
  }

  async execute({ userId }) {
    if (!userId) {
      throw new BadRequestError('User ID is required');
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found.');
    }

    const deleted = await this.userRepository.deleteAccount(userId);
    if (!deleted) {
      throw new NotFoundError('User not found or already deleted.');
    }

    return {
      success: true,
      message: 'Your account has been deleted successfully. Personal authentication data has been removed.',
    };
  }
}

