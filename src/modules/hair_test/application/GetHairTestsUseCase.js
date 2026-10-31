export class GetHairTestsUseCase {
  constructor({ hairTestRepository, imageStorage }) {
    this.hairTestRepository = hairTestRepository;
    this.imageStorage = imageStorage;
  }

  async execute({ userId }) {
    const tests = await this.hairTestRepository.findByUserId(userId);
    return Promise.all(tests.map(async (test) => {
      const summary = test.toSummary();
      summary.scalp_photos = await Promise.all((summary.scalp_photos || []).filter((photo) => !photo.deleted_at).map(async (photo) => ({
        ...photo,
        url: (photo.delivery_type === 'authenticated' && photo.file_name && photo.format)
          ? this.imageStorage.createPrivateDownloadUrl(photo.file_name, photo.format)
          : photo.url,
        url_expires_in_seconds: photo.delivery_type === 'authenticated' ? 300 : null,
      })));
      return summary;
    }));
  }
}

