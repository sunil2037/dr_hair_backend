export const normalizeLogin = (login) => {
  const value = String(login || '').trim();
  return value.includes('@') ? value.toLowerCase() : value.replace(/\D/g, '');
};

export const isValidLogin = (login) => {
  if (!login) return false;
  if (login.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login);
  return /^\d{7,15}$/.test(login);
};
