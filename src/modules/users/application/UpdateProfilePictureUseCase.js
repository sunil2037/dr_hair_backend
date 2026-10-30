import { NotFoundError, BadRequestError } from '../../../shared/errors/index.js';

export class UpdateProfilePictureUseCase {
  constructor({ userRepository }) {
    this.userRepository = userRepository;
  }

  async execute({ userId, file, action }) {
    if (!userId) {
      throw new BadRequestError('User ID is required');
    }

    if (!file) {
      throw new BadRequestError('Profile image file is required');
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found.');
    }

    // Relative path stored in database (e.g. 'uploads/profiles/filename.jpg')
    const relativePath = `uploads/profiles/${file.filename}`;
    const updatedUser = await this.userRepository.updateAvatar(userId, relativePath);

    return {
      profileUrl: relativePath,
      user: updatedUser,
      message: 'Profile photo updated successfully.',
    };
  }
}

