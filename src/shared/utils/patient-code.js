export function formatPatientCode(id) {
  const numericId = Number(id);
  if (!Number.isSafeInteger(numericId) || numericId < 1) return '';
  return `DHP${String(numericId).padStart(4, '0')}`;
}

export function parsePatientCode(value) {
  const candidate = String(value || '').trim().toUpperCase();
  const match = /^DHP(\d{4,})$/.exec(candidate);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 && formatPatientCode(id) === candidate ? id : null;
}

export function resolvePatientId(value) {
  const candidate = String(value ?? '').trim();
  if (/^\d+$/.test(candidate)) {
    const id = Number(candidate);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  }
  return parsePatientCode(candidate);
}
