import { BadRequestError } from '../../../shared/errors/index.js';

export class GetTreatmentHistoryUseCase {
  constructor({ treatmentRepository }) {
    this.treatmentRepository = treatmentRepository;
  }

  async execute({ referenceNoOrId, userId }) {
    if (!referenceNoOrId || !userId) {
      throw new BadRequestError('Test reference number or ID is required.');
    }

    const treatments = await this.treatmentRepository.findByTestIdentifier(referenceNoOrId, { userId });
    return treatments.map((t) => t.toResponse());
  }
}

