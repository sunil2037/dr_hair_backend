import { NotFoundError, BadRequestError } from '../../../shared/errors/index.js';

export class UpdateProfilePictureUseCase {
  constructor({ userRepository, imageStorage }) {
    this.userRepository = userRepository;
    this.imageStorage = imageStorage;
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
    const stored = await this.imageStorage.uploadImage(
      file.buffer,
      'profiles',
      'user-' + userId,
    );
    const updatedUser = await this.userRepository.updateAvatar(userId, stored.secureUrl);

    return {
      profileUrl: stored.secureUrl,
      user: updatedUser,
      message: 'Profile photo updated successfully.',
    };
  }
}

