import { BadRequestError, NotFoundError } from '../../../shared/errors/index.js';
import { sendSuccess } from '../../../shared/utils/response.js';

export class ContentController {
  constructor({ contentRepository, auditEventRepository = null }) {
    this.contentRepository = contentRepository;
    this.auditEventRepository = auditEventRepository;
  }

  listPublishedContent = async (req, res, next) => {
    try {
      const { type, placement, limit } = req.query || {};
      const items = await this.contentRepository.listPublished({ type, placement, limit });
      return sendSuccess(res, { data: items });
    } catch (error) {
      next(error);
    }
  };

  listFaqs = async (req, res, next) => {
    try {
      const { placement, limit } = req.query || {};
      const items = await this.contentRepository.listPublished({ type: 'faq', placement, limit });
      return sendSuccess(res, { data: items });
    } catch (error) {
      next(error);
    }
  };

  listStories = async (req, res, next) => {
    try {
      const { limit } = req.query || {};
      const items = await this.contentRepository.listPublished({ type: 'story', limit });
      return sendSuccess(res, { data: items });
    } catch (error) {
      next(error);
    }
  };

  listTips = async (req, res, next) => {
    try {
      const { placement, limit } = req.query || {};
      const items = await this.contentRepository.listPublished({ type: 'tip', placement, limit });
      return sendSuccess(res, { data: items });
    } catch (error) {
      next(error);
    }
  };

  listAdmin = async (req, res, next) => {
    try {
      const { type, status, placement, page, limit } = req.query || {};
      const result = await this.contentRepository.listAdmin({ type, status, placement, page, limit });
      return sendSuccess(res, { data: result });
    } catch (error) {
      next(error);
    }
  };

  createContent = async (req, res, next) => {
    try {
      const {
        type,
        title,
        subtitle,
        content,
        imageUrl,
        actionUrl,
        placement = 'home',
        status = 'draft',
        provenance = {},
        sortOrder = 0,
        metadata = {},
      } = req.body || {};

      if (!type || typeof type !== 'string') throw new BadRequestError('Content type is required.');
      if (!title || typeof title !== 'string' || !title.trim()) throw new BadRequestError('Content title is required.');

      const actor = String(req.user?.email || req.user?.login || 'Super Admin');
      const item = await this.contentRepository.create({
        type,
        title: title.trim(),
        subtitle,
        content,
        imageUrl,
        actionUrl,
        placement,
        status,
        provenance: {
          ...provenance,
          approved_by: status === 'published' ? actor : '',
          approved_at: status === 'published' ? new Date() : null,
        },
        sortOrder,
        metadata,
      });

      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor,
          action: 'content.created',
          target: `content:${item.id}`,
          metadata: { id: item.id, type: item.type, title: item.title, status: item.status },
        }).catch(() => null);
      }

      return sendSuccess(res, { message: 'Content item created.', data: item }, 201);
    } catch (error) {
      next(error);
    }
  };

  updateStatus = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status, note } = req.body || {};
      if (!status || typeof status !== 'string') throw new BadRequestError('Status is required.');

      const actor = String(req.user?.email || req.user?.login || 'Super Admin');
      const updated = await this.contentRepository.updateStatus(id, status.trim(), {
        approved_by: actor,
        note: typeof note === 'string' ? note.trim() : '',
      });
      if (!updated) throw new NotFoundError('Content item not found.');

      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor,
          action: 'content.status_updated',
          target: `content:${id}`,
          metadata: { id, status: updated.status, note },
        }).catch(() => null);
      }

      return sendSuccess(res, { message: 'Content status updated.', data: updated });
    } catch (error) {
      next(error);
    }
  };

  updateContent = async (req, res, next) => {
    try {
      const { id } = req.params;
      const updates = req.body || {};
      const updated = await this.contentRepository.update(id, updates);
      if (!updated) throw new NotFoundError('Content item not found.');

      const actor = String(req.user?.email || req.user?.login || 'Super Admin');
      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor,
          action: 'content.updated',
          target: `content:${id}`,
          metadata: { id },
        }).catch(() => null);
      }

      return sendSuccess(res, { message: 'Content item updated.', data: updated });
    } catch (error) {
      next(error);
    }
  };

  deleteContent = async (req, res, next) => {
    try {
      const { id } = req.params;
      const deleted = await this.contentRepository.delete(id);
      if (!deleted) throw new NotFoundError('Content item not found.');

      const actor = String(req.user?.email || req.user?.login || 'Super Admin');
      if (this.auditEventRepository?.record) {
        await this.auditEventRepository.record({
          actor,
          action: 'content.deleted',
          target: `content:${id}`,
          metadata: { id },
        }).catch(() => null);
      }

      return sendSuccess(res, { message: 'Content item deleted.' });
    } catch (error) {
      next(error);
    }
  };
}

