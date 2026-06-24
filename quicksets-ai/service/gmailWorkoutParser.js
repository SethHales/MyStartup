const trackedFieldOrder = ['reps', 'weight', 'distance', 'duration'];

const weightUnits = {
  lb: 'lbs',
  lbs: 'lbs',
  pound: 'lbs',
  pounds: 'lbs',
  kg: 'kgs',
  kgs: 'kgs',
  kilogram: 'kgs',
  kilograms: 'kgs',
};

const distanceUnits = {
  mi: 'miles',
  mile: 'miles',
  miles: 'miles',
  km: 'kms',
  kms: 'kms',
  kilometer: 'kms',
  kilometers: 'kms',
  m: 'meters',
  meter: 'meters',
  meters: 'meters',
  ft: 'feet',
  foot: 'feet',
  feet: 'feet',
};

const distanceInMeters = {
  miles: 1609.344,
  kms: 1000,
  meters: 1,
  feet: 0.3048,
};

function normalizeExerciseName(value = '') {
  return `${value}`
    .trim()
    .replace(/^([*_])(.+)\1$/, '$2')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ');
}

function normalizeWorkoutLogDate(value = '') {
  const trimmedValue = `${value}`.trim();
  const match = trimmedValue.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (!match) {
    return '';
  }

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return '';
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getTrackedFields(fields) {
  return trackedFieldOrder.filter((field) => Boolean(fields?.[field]));
}

function parseNumericToken(token) {
  const match = `${token}`.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([a-z]+)?$/);
  if (!match) {
    return null;
  }

  return {
    value: Number(match[1]),
    unit: match[2] || '',
  };
}

function detectTokenField(token, fallbackField = '') {
  const trimmedToken = `${token}`.trim().toLowerCase();
  if (/^\d+:\d{2}(?::\d{2})?$/.test(trimmedToken)) {
    return 'duration';
  }

  const numericToken = parseNumericToken(trimmedToken);
  if (!numericToken) {
    return 'unknown';
  }

  if (weightUnits[numericToken.unit]) {
    return 'weight';
  }

  if (distanceUnits[numericToken.unit]) {
    return 'distance';
  }

  if (!numericToken.unit) {
    return fallbackField || 'number';
  }

  return 'unknown';
}

function formatNumber(value) {
  return Number(value.toFixed(4)).toString();
}

function parseReps(token) {
  if (!/^\d+$/.test(`${token}`.trim())) {
    return { error: `expected reps but got ${detectTokenField(token)}` };
  }

  return { value: `${Number(token)}` };
}

function parseWeight(token, targetUnit) {
  const parsedToken = parseNumericToken(token);
  if (!parsedToken || (parsedToken.unit && !weightUnits[parsedToken.unit])) {
    return { error: `expected weight but got ${detectTokenField(token)}` };
  }

  const sourceUnit = weightUnits[parsedToken.unit] || 'lbs';
  const normalizedTargetUnit = targetUnit === 'kgs' ? 'kgs' : 'lbs';
  let value = parsedToken.value;

  if (sourceUnit !== normalizedTargetUnit) {
    value = sourceUnit === 'lbs'
      ? value * 0.45359237
      : value / 0.45359237;
  }

  return { value: formatNumber(value) };
}

function parseDistance(token, targetUnit) {
  const parsedToken = parseNumericToken(token);
  if (!parsedToken || (parsedToken.unit && !distanceUnits[parsedToken.unit])) {
    return { error: `expected distance but got ${detectTokenField(token)}` };
  }

  const sourceUnit = distanceUnits[parsedToken.unit] || 'miles';
  const normalizedTargetUnit = distanceInMeters[targetUnit] ? targetUnit : 'miles';
  const valueInMeters = parsedToken.value * distanceInMeters[sourceUnit];
  return { value: formatNumber(valueInMeters / distanceInMeters[normalizedTargetUnit]) };
}

function parseDuration(token) {
  const parts = `${token}`.trim().split(':');
  if (![2, 3].includes(parts.length) || parts.some((part) => !/^\d+$/.test(part))) {
    return { error: `expected duration but got ${detectTokenField(token)}` };
  }

  const values = parts.map(Number);
  const minutes = parts.length === 2 ? values[0] : values[1];
  const seconds = values[values.length - 1];
  if (seconds > 59 || (parts.length === 3 && minutes > 59)) {
    return { error: 'duration contains invalid minutes or seconds' };
  }

  if (parts.length === 2) {
    return { value: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` };
  }

  return {
    value: `${String(values[0]).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
  };
}

function describeDetectedFields(tokens, expectedFields) {
  return tokens
    .map((token, index) => detectTokenField(token, expectedFields[index]))
    .join(', ');
}

function parseWorkoutSetLine(line, template) {
  const expectedFields = getTrackedFields(template?.fields);
  const tokens = `${line}`
    .split(/[x×]/i)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length !== expectedFields.length) {
    return {
      error: `fields mismatched (expected ${expectedFields.join(', ')}; got ${describeDetectedFields(tokens, expectedFields) || 'nothing'})`,
    };
  }

  const set = { setType: 'regular' };
  for (let index = 0; index < expectedFields.length; index += 1) {
    const field = expectedFields[index];
    const token = tokens[index];
    const result = field === 'reps'
      ? parseReps(token)
      : field === 'weight'
        ? parseWeight(token, template?.measurements?.weight)
        : field === 'distance'
          ? parseDistance(token, template?.measurements?.distance)
          : parseDuration(token);

    if (result.error) {
      return {
        error: `fields mismatched (expected ${expectedFields.join(', ')}; got ${describeDetectedFields(tokens, expectedFields)}): ${result.error}`,
      };
    }

    set[field] = result.value;
  }

  return { set };
}

function looksLikeSetLine(line) {
  const tokens = `${line}`.split(/[x×]/i).map((token) => token.trim()).filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => detectTokenField(token) !== 'unknown');
}

function parseWorkoutLogBody(body, templates) {
  const lines = `${body || ''}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('>'));
  const username = lines[0] || '';
  const password = lines[1] || '';
  const rawDate = lines[2] || '';
  const date = normalizeWorkoutLogDate(rawDate);
  const templateMap = new Map(
    templates.map((template) => [normalizeExerciseName(template.name), template])
  );
  const blocks = [];
  let currentBlock = null;

  lines.slice(3).forEach((line) => {
    const matchingTemplate = templateMap.get(normalizeExerciseName(line));
    if (matchingTemplate || !looksLikeSetLine(line)) {
      currentBlock = {
        name: line,
        template: matchingTemplate || null,
        setLines: [],
      };
      blocks.push(currentBlock);
      return;
    }

    if (!currentBlock) {
      blocks.push({
        name: '(Unknown exercise)',
        template: null,
        setLines: [line],
      });
      currentBlock = blocks[blocks.length - 1];
      return;
    }

    currentBlock.setLines.push(line);
  });

  return {
    username,
    password,
    rawDate,
    date,
    blocks,
  };
}

module.exports = {
  getTrackedFields,
  normalizeExerciseName,
  normalizeWorkoutLogDate,
  parseWorkoutLogBody,
  parseWorkoutSetLine,
};
