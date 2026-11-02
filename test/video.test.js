import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VideoController } from '../src/modules/media/presentation/video.controller.js';

const responseRecorder = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

describe('Admin video content', () => {
  it('stores a YouTube video with category and Home/Reels placement', async () => {
    let savedVideo;
    const controller = new VideoController({
      videoRepository: {
        create: async (video) => { savedVideo = video; return video; },
      },
    });
    const res = responseRecorder();

    await controller.addYouTubeVideo({
      body: {
        url: 'https://youtu.be/abcdefghijk',
        title: 'Hair care guide',
        category: 'Hair Fall',
        description: 'A short guide',
        placement: 'both',
      },
      user: { id: 7 },
    }, res, (error) => { throw error; });

    assert.equal(res.statusCode, 201);
    assert.equal(savedVideo.provider, 'youtube');
    assert.equal(savedVideo.category, 'Hair Fall');
    assert.equal(savedVideo.placement, 'both');
    assert.equal(savedVideo.secure_url, 'https://www.youtube-nocookie.com/embed/abcdefghijk');
  });

  it('rejects unsupported placement values', async () => {
    const controller = new VideoController({ videoRepository: { create: async () => assert.fail('must not save') } });
    let error;
    await controller.addYouTubeVideo({
      body: { url: 'https://youtu.be/abcdefghijk', title: 'Hair care guide', placement: 'stories' },
    }, responseRecorder(), (caught) => { error = caught; });

    assert.equal(error?.statusCode, 400);
    assert.match(error?.message || '', /placement must be home, reels, or both/i);
  });

  it('passes the Home/Reels filter to the published-video list', async () => {
    let requested;
    const controller = new VideoController({
      videoRepository: {
        listPublished: async (options) => { requested = options; return []; },
      },
    });
    const res = responseRecorder();
    await controller.listPublished({ query: { limit: '8', placement: 'home' } }, res, (error) => { throw error; });

    assert.deepEqual(requested, { limit: '8', placement: 'home' });
    assert.equal(res.statusCode, 200);
  });

  it('supports chunk loading with page, limit, and category filtering', async () => {
    let requested;
    const controller = new VideoController({
      videoRepository: {
        listPublished: async (options) => {
          requested = options;
          return { items: [{ id: 'vid-1', title: 'Test Video' }], total: 8, page: 2, limit: 3, has_more: true };
        },
      },
    });
    const res = responseRecorder();
    await controller.listPublished({ query: { page: '2', limit: '3', category: 'Hair Fall', placement: 'reels' } }, res, (error) => { throw error; });

    assert.deepEqual(requested, { page: '2', limit: '3', category: 'Hair Fall', placement: 'reels' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.has_more, true);
    assert.equal(res.body.data.items.length, 1);
  });

  it('deletes video by publicId', async () => {
    let deletedId;
    const controller = new VideoController({
      videoRepository: {
        delete: async (id) => { deletedId = id; return true; },
      },
    });
    const res = responseRecorder();
    await controller.deleteVideo({ params: { publicId: 'drhair/videos/sample' } }, res, (error) => { throw error; });

    assert.equal(deletedId, 'drhair/videos/sample');
    assert.equal(res.statusCode, 200);
    assert.match(res.body.message, /deleted successfully/i);
  });

  it('verifies real repository chunk loading: page 1 has_more true, page 2 has_more false', async () => {
    const { VideoRepository } = await import('../src/modules/media/infrastructure/VideoRepository.js');
    const repo = new VideoRepository();

    const chunk1 = await repo.listPublished({ page: 1, limit: 10, placement: 'reels' });
    assert.equal(chunk1.page, 1);
    assert.equal(chunk1.limit, 10);
    assert.equal(chunk1.items.length, 10);
    assert.equal(chunk1.has_more, true);
    assert.equal(chunk1.total >= 15, true);

    const chunk2 = await repo.listPublished({ page: 2, limit: 10, placement: 'reels' });
    assert.equal(chunk2.page, 2);
    assert.equal(chunk2.items.length > 0, true);
    assert.equal(chunk2.has_more, false);

    // Verify no overlap between chunk 1 and chunk 2
    const chunk1Ids = new Set(chunk1.items.map((v) => v.public_id));
    for (const item of chunk2.items) {
      assert.equal(chunk1Ids.has(item.public_id), false);
    }
  });

  it('verifies real repository category filter with chunk loading', async () => {
    const { VideoRepository } = await import('../src/modules/media/infrastructure/VideoRepository.js');
    const repo = new VideoRepository();

    const dandruffVideos = await repo.listPublished({ page: 1, limit: 10, category: 'Dandruff', placement: 'reels' });
    assert.equal(dandruffVideos.items.length >= 4, true);
    for (const video of dandruffVideos.items) {
      assert.match(video.category, /dandruff/i);
    }
  });
});
