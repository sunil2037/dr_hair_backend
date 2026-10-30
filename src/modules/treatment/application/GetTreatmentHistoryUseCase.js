import { BadRequestError } from '../../../shared/errors/index.js';

export class GetTreatmentHistoryUseCase {
  constructor({ treatmentRepository }) {
    this.treatmentRepository = treatmentRepository;
  }

  async execute({ referenceNoOrId }) {
    if (!referenceNoOrId) {
      throw new BadRequestError('Test reference number or ID is required.');
    }

    const treatments = await this.treatmentRepository.findByTestIdentifier(referenceNoOrId);
    return treatments.map((t) => t.toResponse());
  }
}

