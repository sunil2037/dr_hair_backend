import { BadRequestError, NotFoundError } from '../../../shared/errors/index.js';
import { sendSuccess } from '../../../shared/utils/response.js';
import {
  createVideoUploadSignature,
  verifyUploadedVideo,
} from '../infrastructure/CloudinaryVideoStorage.js';

export class VideoController {
  constructor({ videoRepository }) {
    this.videoRepository = videoRepository;
  }

  uploadSignature = async (req, res, next) => {
    try {
      const publicId = req.body?.public_id;
      if (
        publicId !== undefined
        && (typeof publicId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(publicId))
      ) {
        throw new BadRequestError('public_id may contain only letters, numbers, underscores, and hyphens.');
      }
      const signature = createVideoUploadSignature({ publicId });
      return sendSuccess(res, { data: signature });
    } catch (error) {
      next(error);
    }
  };

  saveUploadedVideo = async (req, res, next) => {
    try {
      const { public_id, title, description = '' } = req.body || {};
      if (typeof title !== 'string' || !title.trim() || title.trim().length > 160) {
        throw new BadRequestError('Video title is required and must be at most 160 characters.');
      }
      if (typeof description !== 'string' || description.length > 2000) {
        throw new BadRequestError('Video description must be a string of at most 2000 characters.');
      }
      const asset = await verifyUploadedVideo(public_id);
      const saved = await this.videoRepository.create({
        ...asset,
        provider: 'cloudinary',
        title: title.trim(),
        description: description.trim(),
        status: 'draft',
        created_by: Number(req.user?.id) || null,
      });
      return sendSuccess(res, {
        message: 'Uploaded video saved as a draft.',
        data: saved,
        statusCode: 201,
      });
    } catch (error) {
      next(error);
    }
  };

  addYouTubeVideo = async (req, res, next) => {
    try {
      const { url, title, description = '' } = req.body || {};
      if (typeof title !== 'string' || !title.trim() || title.trim().length > 160) {
        throw new BadRequestError('Video title is required and must be at most 160 characters.');
      }
      if (typeof description !== 'string' || description.length > 2000) {
        throw new BadRequestError('Video description must be a string of at most 2000 characters.');
      }
      const videoId = this.getYouTubeVideoId(url);
      const saved = await this.videoRepository.create({
        public_id: 'youtube-' + videoId,
        provider: 'youtube',
        youtube_video_id: videoId,
        title: title.trim(),
        description: description.trim(),
        secure_url: 'https://www.youtube-nocookie.com/embed/' + videoId,
        thumbnail_url: 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg',
        duration: null,
        status: 'draft',
        created_by: Number(req.user?.id) || null,
      });
      return sendSuccess(res, {
        message: 'YouTube video saved as a draft.',
        data: saved,
        statusCode: 201,
      });
    } catch (error) {
      next(error);
    }
  };

  getYouTubeVideoId = (input) => {
    if (typeof input !== 'string' || input.length > 500) {
      throw new BadRequestError('A valid YouTube video URL is required.');
    }
    let url;
    try {
      url = new URL(input);
    } catch {
      throw new BadRequestError('A valid YouTube video URL is required.');
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let videoId = null;
    if (host === 'youtu.be') {
      videoId = url.pathname.split('/').filter(Boolean)[0];
    } else if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host)) {
      if (url.pathname === '/watch') videoId = url.searchParams.get('v');
      else if (url.pathname.startsWith('/embed/')) videoId = url.pathname.split('/')[2];
      else if (url.pathname.startsWith('/shorts/')) videoId = url.pathname.split('/')[2];
    }
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId || '')) {
      throw new BadRequestError('The URL must point to a single YouTube video.');
    }
    return videoId;
  };

  listPublished = async (req, res, next) => {
    try {
      const items = await this.videoRepository.listPublished({ limit: req.query.limit });
      return sendSuccess(res, { data: items });
    } catch (error) {
      next(error);
    }
  };

  listAdmin = async (req, res, next) => {
    try {
      const result = await this.videoRepository.listAdmin({
        page: req.query.page,
        limit: req.query.limit,
      });
      return sendSuccess(res, { data: result });
    } catch (error) {
      next(error);
    }
  };

  updateStatus = async (req, res, next) => {
    try {
      const { public_id, status } = req.body || {};
      if (typeof public_id !== 'string' || !public_id.trim()) {
        throw new BadRequestError('public_id is required.');
      }
      if (!['draft', 'published', 'hidden'].includes(status)) {
        throw new BadRequestError('status must be draft, published, or hidden.');
      }
      const video = await this.videoRepository.updateStatus(public_id.trim(), status);
      if (!video) throw new NotFoundError('Video not found.');
      return sendSuccess(res, { message: 'Video status updated.', data: video });
    } catch (error) {
      next(error);
    }
  };
}
