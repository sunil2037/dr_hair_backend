import { BadRequestError, UnauthorizedError } from '../../../shared/errors/index.js';
import { normalizeLogin } from '../../../shared/utils/normalize-login.js';

export class RegisterUserUseCase {
  constructor({ userRepository }) {
    this.userRepository = userRepository;
  }

  async execute({
    name,
    email,
    phone,
    age,
    gender,
    city,
    occupation,
    platform = 'app',
    verifiedLogin,
    userId,
  }) {
    const cleanName = String(name || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPhone = String(phone || '').trim();
    if (!cleanName || (!cleanEmail && !cleanPhone)) {
      throw new BadRequestError('Name and at least email or phone number are required.');
    }
    if (!verifiedLogin || typeof verifiedLogin !== 'string') {
      throw new UnauthorizedError('Verify your email or phone number before creating a profile.');
    }
    const cleanLogin = normalizeLogin(verifiedLogin);
    const verifiedEmailMatches =
      cleanLogin.includes('@') && cleanEmail === cleanLogin;
    const verifiedPhoneMatches =
      !cleanLogin.includes('@')
      && normalizeLogin(cleanPhone) === cleanLogin;
    if (
      (!verifiedEmailMatches && !verifiedPhoneMatches)
      || (cleanEmail && !verifiedEmailMatches)
      || (cleanPhone && !verifiedPhoneMatches)
    ) {
      throw new UnauthorizedError('Only the email or phone verified in this session can be registered.');
    }

    // Resolve an existing account from the verified identity only. Never use an
    // unverified email/phone in the request to select another user's account.
    let existingUser = userId
      ? await this.userRepository.findById(userId)
      : await this.userRepository.findByLogin(cleanLogin);
    if (userId && !existingUser) {
      throw new UnauthorizedError('The authenticated user account could not be found.');
    }
    const accountForVerifiedLogin = await this.userRepository.findByLogin(cleanLogin);
    if (existingUser && accountForVerifiedLogin && accountForVerifiedLogin.id !== existingUser.id) {
      throw new UnauthorizedError('The verified login does not belong to this account.');
    }
    if (!existingUser) existingUser = accountForVerifiedLogin;

    const submittedEmail = verifiedEmailMatches ? cleanEmail : undefined;
    const submittedPhone = verifiedPhoneMatches ? cleanPhone : undefined;
    const emailOwner = submittedEmail ? await this.userRepository.findByEmail(submittedEmail) : null;
    const phoneOwner = submittedPhone ? await this.userRepository.findByPhone(submittedPhone) : null;
    if ((emailOwner && emailOwner.id !== existingUser?.id) || (phoneOwner && phoneOwner.id !== existingUser?.id)) {
      throw new BadRequestError('That email or phone number is already linked to another account.');
    }

    if (existingUser) {
      // Update existing record with the submitted demographic details
      const updatedUser = await this.userRepository.update(existingUser.id, {
        name: cleanName,
        email: submittedEmail || existingUser.email,
        phone: submittedPhone || existingUser.phone,
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
      name: cleanName,
      email: submittedEmail,
      phone: submittedPhone,
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

