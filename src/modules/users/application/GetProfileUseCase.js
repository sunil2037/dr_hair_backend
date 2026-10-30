import { NotFoundError } from '../../../shared/errors/index.js';

export class GetProfileUseCase {
  constructor({ userRepository }) {
    this.userRepository = userRepository;
  }

  async execute({ userId }) {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new NotFoundError('User profile not found.');
    }

    return user.toPublicProfile();
  }
}

