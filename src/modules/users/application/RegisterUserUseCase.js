import { BadRequestError } from '../../../shared/errors/index.js';

export class RegisterUserUseCase {
  constructor({ userRepository }) {
    this.userRepository = userRepository;
  }

  async execute({ name, email, phone, age, gender, city, occupation, platform = 'app' }) {
    if (!name || (!email && !phone)) {
      throw new BadRequestError('Name and at least email or phone number are required.');
    }

    // Check if user already exists
    let existingUser = null;
    if (phone) existingUser = await this.userRepository.findByPhone(phone);
    if (!existingUser && email) existingUser = await this.userRepository.findByEmail(email);

    if (existingUser) {
      // Update existing record with the submitted demographic details
      const updatedUser = await this.userRepository.update(existingUser.id, {
        name,
        email: email || existingUser.email,
        phone: phone || existingUser.phone,
        age: age ? parseInt(age, 10) : existingUser.age,
        gender: gender || existingUser.gender,
        city: city || existingUser.city,
        occupation: occupation || existingUser.occupation,
        platform: platform || existingUser.platform,
      });

      return {
        isNew: false,
        user: updatedUser,
        message: 'User profile updated successfully.',
      };
    }

    // Create new user
    const newUser = await this.userRepository.create({
      name,
      email,
      phone,
      age: age ? parseInt(age, 10) : null,
      gender,
      city,
      occupation,
      platform,
    });

    return {
      isNew: true,
      user: newUser,
      message: 'User registered successfully.',
    };
  }
}

