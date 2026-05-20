export function parseLocalDate(dateValue) {
  return new Date(`${dateValue}T00:00:00`);
}

export function normalizeSetType(value) {
  return ['regular', 'warmup', 'max'].includes(value) ? value : 'regular';
}

export function getSetDisplayLabel(set, sets, index) {
  const setType = normalizeSetType(set?.setType);

  if (setType === 'warmup') {
    return 'Warmup';
  }

  if (setType === 'max') {
    return 'Max';
  }

  return sets
    .slice(0, index + 1)
    .filter((currentSet) => normalizeSetType(currentSet?.setType) === 'regular')
    .length;
}

export function formatMeasurementLabel(value, fallback = 'default') {
  switch (value) {
    case 'lbs':
      return 'lbs';
    case 'kgs':
      return 'kg';
    case 'kms':
      return 'km';
    case 'meters':
      return 'm';
    case 'feet':
      return 'ft';
    case 'miles':
      return 'mi';
    default:
      return fallback;
  }
}

export function parseDurationToSeconds(duration, defaultSeconds = 0) {
  if (!duration) {
    return defaultSeconds;
  }

  const parts = `${duration}`.split(':').map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part) || part < 0)) {
    return defaultSeconds;
  }

  if (parts.length === 2) {
    return Math.floor(parts[0] * 60 + parts[1]);
  }

  if (parts.length === 3) {
    return Math.floor(parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }

  const seconds = Number(duration);
  return Number.isNaN(seconds) ? defaultSeconds : Math.max(0, Math.floor(seconds));
}

export function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Math.abs(totalSeconds)));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatSignedDuration(totalSeconds) {
  const prefix = totalSeconds < 0 ? '-' : '';
  return `${prefix}${formatDuration(totalSeconds)}`;
}
