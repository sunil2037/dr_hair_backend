import { BadRequestError, NotFoundError } from '../../../shared/errors/index.js';
import { sendSuccess } from '../../../shared/utils/response.js';

export class AdminController {
  constructor({ userRepository, hairTestRepository, treatmentRepository, reviewRepository }) {
    this.userRepository = userRepository;
    this.hairTestRepository = hairTestRepository;
    this.treatmentRepository = treatmentRepository;
    this.reviewRepository = reviewRepository;
  }

  listUsers = async (req, res, next) => {
    try {
      const result = await this.userRepository.list({
        page: req.query.page,
        limit: req.query.limit,
        search: req.query.search,
      });
      return sendSuccess(res, {
        data: {
          ...result,
          items: result.items.map((user) => ({
            ...user.toPublicProfile(),
            role: user.role,
            created_at: user.created_at,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  listHairTests = async (req, res, next) => {
    try {
      const result = await this.hairTestRepository.list({
        page: req.query.page,
        limit: req.query.limit,
      });
      return sendSuccess(res, { data: result });
    } catch (error) {
      next(error);
    }
  };

  listTreatments = async (req, res, next) => {
    try {
      const result = await this.treatmentRepository.list({
        page: req.query.page,
        limit: req.query.limit,
      });
      return sendSuccess(res, { data: result });
    } catch (error) {
      next(error);
    }
  };

  createTreatment = async (req, res, next) => {
    try {
      const {
        reference_no,
        treatment_name,
        duration = '',
        instructions = '',
        doctor_name = '',
        date,
      } = req.body || {};
      if (typeof reference_no !== 'string' || !reference_no.trim()) {
        throw new BadRequestError('reference_no is required.');
      }
      if (typeof treatment_name !== 'string' || !treatment_name.trim()) {
        throw new BadRequestError('treatment_name is required.');
      }
      if ([duration, instructions, doctor_name].some((value) => typeof value !== 'string')) {
        throw new BadRequestError('duration, instructions, and doctor_name must be strings.');
      }
      const hairTest = await this.hairTestRepository.findByReferenceNo(reference_no.trim());
      if (!hairTest) throw new NotFoundError('Hair test not found for that reference number.');

      const treatment = await this.treatmentRepository.create({
        test_id: hairTest.id,
        reference_no: hairTest.reference_no,
        userId: hairTest.userId,
        treatment_name: treatment_name.trim(),
        duration: duration.trim(),
        instructions: instructions.trim(),
        doctor_name: doctor_name.trim(),
        ...(date ? { date } : {}),
      });
      return sendSuccess(res, {
        message: 'Treatment plan created.',
        data: treatment.toResponse(),
        statusCode: 201,
      });
    } catch (error) {
      next(error);
    }
  };

  listReviews = async (req, res, next) => {
    try {
      const result = await this.reviewRepository.listAdmin({
        page: req.query.page,
        limit: req.query.limit,
        status: req.query.status,
      });
      return sendSuccess(res, { data: result });
    } catch (error) {
      next(error);
    }
  };

  updateReviewStatus = async (req, res, next) => {
    try {
      const { id, status } = req.body || {};
      if (!Number.isInteger(Number(id))) throw new BadRequestError('A numeric review id is required.');
      if (!['pending', 'active', 'rejected'].includes(status)) {
        throw new BadRequestError('status must be pending, active, or rejected.');
      }
      const review = await this.reviewRepository.updateStatus(id, status);
      if (!review) throw new NotFoundError('Review not found.');
      return sendSuccess(res, { message: 'Review status updated.', data: review });
    } catch (error) {
      next(error);
    }
  };
}
