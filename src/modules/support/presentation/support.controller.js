import { sendSuccess } from '../../../shared/utils/response.js';
import { BadRequestError, NotFoundError } from '../../../shared/errors/index.js';

export class SupportController {
  constructor({ supportInquiryRepository }) {
    this.supportInquiryRepository = supportInquiryRepository;
  }

  submitInquiry = async (req, res, next) => {
    try {
      const { name, email, phone, message } = req.body || {};
      if (!name || typeof name !== 'string' || name.trim().length < 2) {
        throw new BadRequestError('Name is required (minimum 2 characters).');
      }
      if (!phone || typeof phone !== 'string' || phone.trim().length < 8) {
        throw new BadRequestError('Valid contact phone number is required.');
      }
      if (!message || typeof message !== 'string' || message.trim().length < 5) {
        throw new BadRequestError('Please provide a message or describe your hair concern (minimum 5 characters).');
      }

      const inquiry = await this.supportInquiryRepository.create({
        name: name.trim(),
        email: email ? String(email).trim().toLowerCase() : null,
        phone: phone.trim(),
        message: message.trim(),
        userId: req.user?.id || null,
      });

      return sendSuccess(res, {
        statusCode: 201,
        message: 'Your inquiry has been submitted. A Dr. Hair clinical coordinator will contact you shortly.',
        data: { id: inquiry.id },
      });
    } catch (err) {
      next(err);
    }
  };

  listInquiries = async (req, res, next) => {
    try {
      const { status, page, limit } = req.query || {};
      const result = await this.supportInquiryRepository.list({ status, page, limit });
      return sendSuccess(res, { data: result });
    } catch (err) {
      next(err);
    }
  };

  updateInquiry = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status, admin_notes } = req.body || {};
      if (!status || !['pending', 'contacted', 'resolved'].includes(status)) {
        throw new BadRequestError('Valid status is required: pending, contacted, or resolved.');
      }

      const updated = await this.supportInquiryRepository.updateStatus(id, status, admin_notes);
      if (!updated) {
        throw new NotFoundError('Inquiry not found.');
      }

      return sendSuccess(res, {
        message: 'Inquiry updated successfully.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  };
}
