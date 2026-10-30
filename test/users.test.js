import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createContainer } from '../src/container.js';

describe('Users / Admin Module - Clean Architecture Tests', () => {
  const container = createContainer();
  const {
    checkUserUseCase,
    registerUserUseCase,
    getProfileUseCase,
    updateProfileUseCase,
    updateProfilePictureUseCase,
  } = container.useCases;

  it('should check existing user session', async () => {
    const session = await checkUserUseCase.execute({ userId: 12 });
    assert.equal(session.id, 12);
    assert.equal(session.name, 'Sunil Sharma');
  });

  it('should register a new user via loginSignup', async () => {
    const result = await registerUserUseCase.execute({
      name: 'Dr. Test User',
      email: 'test@drhair.health',
      phone: '9123456789',
      age: 30,
      gender: 'Female',
      city: 'Bangalore',
      occupation: 'Designer',
      platform: 'app',
    });

    assert.equal(result.isNew, true);
    assert.equal(result.user.name, 'Dr. Test User');
    assert.equal(result.user.age, 30);
  });

  it('should get user profile', async () => {
    const profile = await getProfileUseCase.execute({ userId: 12 });
    assert.equal(profile.id, 12);
    assert.equal(profile.name, 'Sunil Sharma');
    assert.ok(profile.email);
  });

  it('should update user profile text fields', async () => {
    const result = await updateProfileUseCase.execute({
      userId: 12,
      name: 'Sunil Sharma Updated',
      email: 'user_updated@example.com',
      contact: '9876543210',
    });

    assert.equal(result.message, 'Profile updated successfully.');
    assert.equal(result.user.name, 'Sunil Sharma Updated');
  });

  it('should update user profile avatar', async () => {
    const result = await updateProfilePictureUseCase.execute({
      userId: 12,
      file: { filename: 'custom_avatar_123.jpg' },
      action: 'upload',
    });

    assert.equal(result.message, 'Profile photo updated successfully.');
    assert.equal(result.profileUrl, 'uploads/profiles/custom_avatar_123.jpg');
  });
});

