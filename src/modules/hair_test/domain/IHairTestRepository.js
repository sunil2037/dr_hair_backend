/**
 * Hair Test Repository Interface
 */
export class IHairTestRepository {
  async create(hairTestData) {
    throw new Error('Method not implemented');
  }

  async findByUserId(userId) {
    throw new Error('Method not implemented');
  }

  async findByReferenceNo(referenceNo) {
    throw new Error('Method not implemented');
  }

  async updateStatus(referenceNo, newStatus, meta) {
    throw new Error('Method not implemented');
  }

  async saveDraft(userId, formData, step) {
    throw new Error('Method not implemented');
  }

  async getDraft(userId) {
    throw new Error('Method not implemented');
  }

  async deleteDraft(userId) {
    throw new Error('Method not implemented');
  }

  async saveAiAssessment(referenceNo, aiAssessment) {
    throw new Error('Method not implemented');
  }
}

