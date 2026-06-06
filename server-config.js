export function parseIntegerSetting(value, { defaultValue, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER }) {
  const fallback = normalizeInteger(defaultValue, min, max, defaultValue);
  const raw = typeof value === 'string' ? value.trim() : value;
  if (raw === undefined || raw === null || raw === '') return fallback;
  return normalizeInteger(Number(raw), min, max, fallback);
}

function normalizeInteger(value, min, max, fallback) {
  if (!Number.isInteger(value)) return fallback;
  if (value < min || value > max) return fallback;
  return value;
}
