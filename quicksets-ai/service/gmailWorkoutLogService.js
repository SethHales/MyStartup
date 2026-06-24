const bcrypt = require('bcryptjs');
const uuid = require('uuid');
const {
  userCollection,
  workoutCollection,
  workoutTemplateCollection,
} = require('./database');
const {
  getTrackedFields,
  parseWorkoutLogBody,
  parseWorkoutSetLine,
} = require('./gmailWorkoutParser');

function sanitizeMeasurements(measurements) {
  return {
    reps: 'default',
    weight: measurements?.weight === 'kgs' ? 'kgs' : 'lbs',
    duration: 'hh:mm:ss',
    distance: ['miles', 'kms', 'meters', 'feet'].includes(measurements?.distance)
      ? measurements.distance
      : 'miles',
    notes: 'default',
  };
}

function sanitizeFields(fields) {
  return {
    reps: Boolean(fields?.reps),
    weight: Boolean(fields?.weight),
    duration: Boolean(fields?.duration),
    distance: Boolean(fields?.distance),
    notes: true,
  };
}

function formatSummary(date, successes, failures) {
  const lines = [`QuickSets email log summary${date ? ` for ${date}` : ''}`, ''];

  if (successes.length > 0) {
    lines.push('Logged:');
    successes.forEach((success) => {
      const suffix = success.alreadyLogged ? ' (already logged from this email)' : '';
      lines.push(`- ${success.name}: ${success.setCount} set${success.setCount === 1 ? '' : 's'}${suffix}`);
    });
    lines.push('');
  }

  if (failures.length > 0) {
    lines.push('Not logged:');
    failures.forEach((failure) => {
      lines.push(`- ${failure.name}: ${failure.reason}`);
    });
    lines.push('');
  }

  lines.push(
    `${successes.length} exercise session${successes.length === 1 ? '' : 's'} logged; `
    + `${failures.length} failed.`
  );
  return lines.join('\n').trim();
}

async function findUserByEmail(email) {
  const normalizedEmail = `${email || ''}`.trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  return userCollection.findOne(
    { email: normalizedEmail },
    { collation: { locale: 'en', strength: 2 } }
  );
}

async function processWorkoutLogEmail(body, sourceMessageId) {
  const headerLines = `${body || ''}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const username = headerLines[0] || '';
  const password = headerLines[1] || '';

  if (!username || !password) {
    return 'No sessions were logged.\n\nThe LOG email must begin with your QuickSets username, password, and workout date on separate lines.';
  }

  const user = await findUserByEmail(username);
  const isAuthenticated = Boolean(user && await bcrypt.compare(password, user.password));
  if (!isAuthenticated) {
    return 'No sessions were logged.\n\nThe supplied QuickSets username or password was incorrect.';
  }

  const templates = await workoutTemplateCollection.find({ userEmail: user.email }).toArray();
  const parsedLog = parseWorkoutLogBody(body, templates);
  if (!parsedLog.date) {
    return `No sessions were logged.\n\n"${parsedLog.rawDate || '(missing date)'}" is not a valid workout date. Use month/day/year, such as 6/11/2026.`;
  }

  if (parsedLog.blocks.length === 0) {
    return 'No sessions were logged.\n\nNo exercise names or sets were found after the date.';
  }

  const successes = [];
  const failures = [];

  for (let blockIndex = 0; blockIndex < parsedLog.blocks.length; blockIndex += 1) {
    const block = parsedLog.blocks[blockIndex];
    if (!block.template) {
      failures.push({
        name: block.name,
        reason: 'exercise template not found in this QuickSets account',
      });
      continue;
    }

    const expectedFields = getTrackedFields(block.template.fields);
    if (expectedFields.length === 0) {
      failures.push({
        name: block.template.name,
        reason: 'exercise template does not have any trackable fields',
      });
      continue;
    }

    if (block.setLines.length === 0) {
      failures.push({
        name: block.template.name,
        reason: 'no sets were provided',
      });
      continue;
    }

    const parsedSets = [];
    let setError = '';
    block.setLines.forEach((setLine, setIndex) => {
      if (setError) {
        return;
      }

      const parsedSet = parseWorkoutSetLine(setLine, block.template);
      if (parsedSet.error) {
        setError = `set ${setIndex + 1} "${setLine}" ${parsedSet.error}`;
        return;
      }

      parsedSets.push({
        id: setIndex + 1,
        ...parsedSet.set,
      });
    });

    if (setError) {
      failures.push({
        name: block.template.name,
        reason: setError,
      });
      continue;
    }

    const sourceExerciseIndex = blockIndex + 1;
    const existingSession = await workoutCollection.findOne({
      userEmail: user.email,
      gmailSourceMessageId: sourceMessageId,
      gmailSourceExerciseIndex: sourceExerciseIndex,
    });

    if (existingSession) {
      successes.push({
        name: block.template.name,
        setCount: parsedSets.length,
        alreadyLogged: true,
      });
      continue;
    }

    const fields = sanitizeFields(block.template.fields);
    const session = {
      id: uuid.v4(),
      createdAt: new Date().toISOString(),
      userEmail: user.email,
      date: parsedLog.date,
      templateId: block.template.id,
      templateName: block.template.name,
      exercise: block.template.name,
      isMixed: false,
      color: block.template.color || '',
      fields,
      measurements: sanitizeMeasurements(block.template.measurements),
      notes: '',
      starred: false,
      sets: parsedSets,
      gmailSourceMessageId: sourceMessageId,
      gmailSourceExerciseIndex: sourceExerciseIndex,
    };

    await workoutCollection.insertOne(session);
    successes.push({
      name: block.template.name,
      setCount: parsedSets.length,
      alreadyLogged: false,
    });
  }

  return formatSummary(parsedLog.date, successes, failures);
}

module.exports = {
  processWorkoutLogEmail,
};
