import { NotFoundError, BadRequestError } from '../../../shared/errors/index.js';
import { config } from '../../../config/env.js';

const ownedProfilePublicId = (url, userId) => {
  if (typeof url !== 'string' || !config.cloudinary.cloudName) return null;
  try {
    const parsed = new URL(url);
    const marker = `/${config.cloudinary.cloudName}/image/upload/`;
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com' || !parsed.pathname.includes(marker)) return null;
    const parts = parsed.pathname.split(marker)[1].split('/').filter(Boolean);
    if (/^v\d+$/.test(parts[0] || '')) parts.shift();
    const publicId = parts.join('/').replace(/\.[a-zA-Z0-9]+$/, '');
    return publicId === `${config.cloudinary.imageFolder}/profiles/user-${userId}` ? publicId : null;
  } catch {
    return null;
  }
};

export class UpdateProfilePictureUseCase {
  constructor({ userRepository, imageStorage }) {
    this.userRepository = userRepository;
    this.imageStorage = imageStorage;
  }

  async execute({ userId, file, action }) {
    if (!userId) {
      throw new BadRequestError('User ID is required');
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found.');
    }

    if (action === 'remove') {
      const publicId = ownedProfilePublicId(user.profile_url, userId);
      if (publicId) await this.imageStorage.deleteImage(publicId);
      const updatedUser = await this.userRepository.updateAvatar(userId, null);
      return {
        profileUrl: null,
        user: updatedUser,
        message: 'Profile photo removed successfully.',
      };
    }

    if (action !== 'upload') {
      throw new BadRequestError('action must be upload or remove.');
    }

    if (!file) {
      throw new BadRequestError('Profile image file is required');
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

