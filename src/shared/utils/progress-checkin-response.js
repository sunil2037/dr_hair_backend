const isoDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const progressCheckInResponse = async (item, imageStorage) => ({
  id: String(item.id),
  date: isoDate(item.date),
  scalp_region: item.scalp_region || 'Scalp',
  shedding_level: item.shedding_level || 'Not recorded',
  notes: item.notes || '',
  density_rating: Number(item.density_rating) || 3,
  is_doctor_reviewed: item.is_doctor_reviewed === true,
  doctor_note: item.doctor_note || '',
  created_at: isoDate(item.created_at),
  photos: await Promise.all((item.photos || []).map(async (photo) => ({
    angle: photo.angle,
    url: photo.delivery_type === 'authenticated' && imageStorage
      ? imageStorage.createPrivateDownloadUrl(photo.public_id, photo.format)
      : photo.url,
    file_name: photo.file_name || '',
    mime_type: photo.mime_type || 'image/jpeg',
    bytes: Number(photo.bytes) || 0,
    url_expires_in_seconds: photo.delivery_type === 'authenticated' ? 300 : null,
  }))),
});
