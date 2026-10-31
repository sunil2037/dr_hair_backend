import {
  ClinicalReportModel,
  HairTestModel,
  ProgressCheckInModel,
  VideoModel,
} from '../../../shared/database/models.js';
import { isMongoConnected } from '../../../shared/database/mongodb.js';
import { store } from '../../../shared/database/store.js';

export class MediaReferenceRepository {
  async isReferenced(publicId) {
    if (isMongoConnected()) {
      const references = await Promise.all([
        HairTestModel.exists({ 'scalp_photos.file_name': publicId }),
        ProgressCheckInModel.exists({ 'photos.public_id': publicId }),
        ClinicalReportModel.exists({ public_id: publicId }),
        VideoModel.exists({ public_id: publicId }),
      ]);
      return references.some(Boolean);
    }
    return store.hairTests.some((item) => item.scalp_photos?.some((photo) => photo.file_name === publicId))
      || store.progressCheckIns.some((item) => item.photos?.some((photo) => photo.public_id === publicId))
      || store.clinicalReports.some((item) => item.public_id === publicId)
      || store.videos.some((item) => item.public_id === publicId);
  }
}
