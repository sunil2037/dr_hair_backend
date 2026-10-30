/**
 * OTP Repository Interface (Contract)
 */
export class IOtpRepository {
  async save(otpEntity) {
    throw new Error('Method not implemented');
  }

  async findByLogin(login) {
    throw new Error('Method not implemented');
  }

  async delete(login) {
    throw new Error('Method not implemented');
  }
}

