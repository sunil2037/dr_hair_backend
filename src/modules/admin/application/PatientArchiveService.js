import { deleteClinicalReport } from '../infrastructure/ClinicalReportStorage.js';
import { logger } from '../../../shared/utils/logger.js';

export class PatientArchiveService {
  constructor({ clinicalReportRepository }) {
    this.clinicalReportRepository = clinicalReportRepository;
    this.running = false;
    this.timer = null;
  }

  async purgeExpiredReports() {
    if (this.running) return 0;
    this.running = true;
    let purged = 0;
    try {
      const expiredReports = await this.clinicalReportRepository.listExpiredArchives(new Date(), 100);
      for (const report of expiredReports) {
        try {
          await deleteClinicalReport(report.public_id);
          const removed = await this.clinicalReportRepository.purgeArchived(report.userId, report.id);
          if (removed) purged += 1;
        } catch (error) {
          logger.warn('Archived clinical report purge will retry on the next run.', { reportId: report.id, message: error?.message });
        }
      }
      if (purged) logger.info('Expired clinical reports permanently purged.', { count: purged });
      return purged;
    } finally {
      this.running = false;
    }
  }

  start(intervalMs = 6 * 60 * 60 * 1000) {
    if (this.timer) return;
    void this.purgeExpiredReports();
    this.timer = setInterval(() => void this.purgeExpiredReports(), intervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
