import { UnauthorizedError, NotFoundError } from '../../../shared/errors/index.js';

export class CheckUserUseCase {
  constructor({ userRepository }) {
    this.userRepository = userRepository;
  }

  async execute({ userId, login }) {
    let user = null;
    if (userId) {
      user = await this.userRepository.findById(userId);
    } else if (login) {
      user = await this.userRepository.findByLogin(login);
    }

    if (!user) {
      throw new UnauthorizedError('User session expired or user not found. Please log in again.');
    }

    return user.toAuthSession();
  }
}

