export class GetHairTestsUseCase {
  constructor({ hairTestRepository }) {
    this.hairTestRepository = hairTestRepository;
  }

  async execute({ userId }) {
    const tests = await this.hairTestRepository.findByUserId(userId);
    return tests.map((t) => t.toSummary());
  }
}

