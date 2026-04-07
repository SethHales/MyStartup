const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const express = require('express');
const uuid = require('uuid');
const app = express();
const mixedWorkoutTemplateId = '__mixed_workout__';
const mixedWorkoutName = 'Mixed Workout';
const workoutColorPalette = [
  '#4da3ff',
  '#27d7c3',
  '#ffba49',
  '#ff7a67',
  '#c084fc',
  '#7dd3fc',
  '#a3e635',
  '#fb7185',
  '#f59e0b',
  '#22c55e',
];

const authCookieName = 'token';

// The workouts and users are saved in mongo
const { userCollection, workoutCollection, workoutTemplateCollection } = require('./database');

// The service port. In production the front-end code is statically hosted by the service on the same port.
const port = process.argv.length > 2 ? process.argv[2] : 4001;

// JSON body parsing using built-in middleware
app.use(express.json());

// Use the cookie parser middleware for tracking authentication tokens
app.use(cookieParser());

// Serve up the front-end static content hosting
app.use(express.static('public'));

// Router for service endpoints
var apiRouter = express.Router();
app.use(`/api`, apiRouter);

// CreateAuth a new user
apiRouter.post('/auth/create', async (req, res) => {
  if (await findUser('email', req.body.email)) {
    res.status(409).send({ msg: 'Existing user' });
  } else {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';

    if (!name) {
      res.status(400).send({ msg: 'Name is required' });
      return;
    }

    const user = await createUser(name, req.body.email, req.body.password);

    setAuthCookie(res, user.token);
    res.send({ email: user.email, name: user.name });
  }
});

// GetAuth login an existing user
apiRouter.post('/auth/login', async (req, res) => {
  const user = await findUser('email', req.body.email);
  if (user) {
    if (await bcrypt.compare(req.body.password, user.password)) {
      user.token = uuid.v4();
      await userCollection.updateOne(
        { email: user.email },
        { $set: { token: user.token } }
      );

      setAuthCookie(res, user.token);
      res.send({ email: user.email, name: user.name || '' });
      return;
    }
  }
  res.status(401).send({ msg: 'Unauthorized' });
});

// DeleteAuth logout a user
apiRouter.delete('/auth/logout', async (req, res) => {
  const user = await findUser('token', req.cookies[authCookieName]);
  if (user) {
    await userCollection.updateOne(
      { email: user.email },
      { $unset: { token: "" } }
    );
  }
  res.clearCookie(authCookieName);
  res.status(204).end();
});

apiRouter.put('/auth/password', verifyAuth, async (req, res) => {
  const currentPassword = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';

  if (!currentPassword || !newPassword) {
    res.status(400).send({ msg: 'Enter your current and new password' });
    return;
  }

  if (!(await bcrypt.compare(currentPassword, req.user.password))) {
    res.status(401).send({ msg: 'Current password is incorrect' });
    return;
  }

  if (newPassword.length < 4) {
    res.status(400).send({ msg: 'New password must be at least 4 characters' });
    return;
  }

  if (currentPassword === newPassword) {
    res.status(400).send({ msg: 'Choose a new password that is different from your current one' });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await userCollection.updateOne(
    { email: req.user.email },
    { $set: { password: passwordHash } }
  );

  res.status(204).end();
});

apiRouter.put('/user/me', verifyAuth, async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';

  if (!name) {
    res.status(400).send({ msg: 'Name is required' });
    return;
  }

  await userCollection.updateOne(
    { email: req.user.email },
    { $set: { name } }
  );

  res.send({ email: req.user.email, name });
});

// Middleware to verify that the user is authorized to call an endpoint
async function verifyAuth(req, res, next) {
  const user = await findUser('token', req.cookies[authCookieName]);
  if (user) {
    req.user = user;
    next();
  } else {
    res.status(401).send({ msg: 'Unauthorized' });
  }
}

// Workouts
apiRouter.get('/workouts', verifyAuth, async (req, res) => {
  const cursor = workoutCollection.find({ userEmail: req.user.email });
  const userWorkouts = (await cursor.toArray()).map((workout) => ({
    ...workout,
    color: sanitizeWorkoutColor(workout.color) || getFallbackWorkoutColor(workout.templateName || workout.exercise),
    sets: Array.isArray(workout.sets)
      ? workout.sets.map((set) => ({
        ...set,
        color: sanitizeWorkoutColor(set.color) || getFallbackWorkoutColor(set.templateName || set.templateId || workout.templateName || workout.exercise),
      }))
      : [],
  }));
  res.send(userWorkouts);
});

apiRouter.put('/workouts/:id', verifyAuth, async (req, res) => {
  const existingWorkout = await workoutCollection.findOne({
    id: req.params.id,
    userEmail: req.user.email,
  });

  if (!existingWorkout) {
    res.status(404).send({ msg: 'Workout not found' });
    return;
  }

  const date = typeof req.body.date === 'string' ? req.body.date : existingWorkout.date;
  const notes = typeof req.body.notes === 'string'
    ? req.body.notes
    : '';
  const starred = Boolean(req.body.starred);
  const inferredFields = existingWorkout.isMixed
    ? buildFieldsFromMixedSets(Array.isArray(req.body.sets) ? req.body.sets : existingWorkout.sets || [])
    : inferFieldsFromSets(Array.isArray(req.body.sets) ? req.body.sets : existingWorkout.sets || []);
  const baseFields = existingWorkout.isMixed
    ? existingWorkout.fields || inferredFields
    : hasTrackedFields(existingWorkout.fields) ? existingWorkout.fields : inferredFields;
  const sets = Array.isArray(req.body.sets)
    ? existingWorkout.isMixed
      ? await Promise.all(req.body.sets.map((set, index) => sanitizeMixedSet(set, req.user.email, index)))
      : req.body.sets.map((set, index) => sanitizeSet(set, baseFields, index))
    : existingWorkout.sets;
  const normalizedMixedSets = existingWorkout.isMixed ? sets.filter(Boolean) : sets;
  const effectiveSets = existingWorkout.isMixed ? normalizedMixedSets : sets;
  const effectiveFields = existingWorkout.isMixed
    ? buildFieldsFromMixedSets(effectiveSets)
    : inferFieldsFromSets(effectiveSets);

  const updatedWorkout = {
    ...existingWorkout,
    date,
    notes,
    starred,
    fields: effectiveFields,
    sets: effectiveSets,
  };

  await workoutCollection.updateOne(
    { id: existingWorkout.id, userEmail: req.user.email },
    { $set: { date, notes, starred, fields: effectiveFields, sets: effectiveSets } }
  );

  res.send(updatedWorkout);
});

apiRouter.delete('/workouts/:id', verifyAuth, async (req, res) => {
  const result = await workoutCollection.deleteOne({
    id: req.params.id,
    userEmail: req.user.email,
  });

  if (result.deletedCount === 0) {
    res.status(404).send({ msg: 'Workout not found' });
    return;
  }

  res.status(204).end();
});

apiRouter.get('/workout-templates', verifyAuth, async (req, res) => {
  const cursor = workoutTemplateCollection.find({ userEmail: req.user.email });
  const templates = (await cursor.toArray()).map((template) => ({
    ...template,
    color: sanitizeWorkoutColor(template.color) || getFallbackWorkoutColor(template.name),
  }));
  res.send(templates);
});

apiRouter.post('/workout-templates', verifyAuth, async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const requestedColor = sanitizeApprovedWorkoutColor(req.body.color);
  const fields = sanitizeFields(req.body.fields);
  const measurements = sanitizeMeasurements(req.body.measurements);

  if (!name) {
    res.status(400).send({ msg: 'Workout name is required' });
    return;
  }

  if (!fields.reps && !fields.weight && !fields.duration && !fields.distance) {
    res.status(400).send({ msg: 'Select at least one set field for this workout' });
    return;
  }

  const existingTemplate = await workoutTemplateCollection.findOne({
    userEmail: req.user.email,
    normalizedName: name.toLowerCase(),
  });

  if (existingTemplate) {
    res.status(409).send({ msg: 'A workout with that name already exists' });
    return;
  }

  const template = {
    id: uuid.v4(),
    userEmail: req.user.email,
    name,
    normalizedName: name.toLowerCase(),
    color: requestedColor || generateUniqueWorkoutColor(existingTemplateColors(await workoutTemplateCollection.find({ userEmail: req.user.email }).toArray()), name),
    fields,
    measurements,
  };

  await workoutTemplateCollection.insertOne(template);
  res.send(template);
});

apiRouter.put('/workout-templates/:id', verifyAuth, async (req, res) => {
  const existingTemplate = await workoutTemplateCollection.findOne({
    id: req.params.id,
    userEmail: req.user.email,
  });

  if (!existingTemplate) {
    res.status(404).send({ msg: 'Workout template not found' });
    return;
  }

  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const requestedColor = sanitizeApprovedWorkoutColor(req.body.color);
  const fields = sanitizeFields(req.body.fields);
  const measurements = sanitizeMeasurements(req.body.measurements);

  if (!name) {
    res.status(400).send({ msg: 'Workout name is required' });
    return;
  }

  if (!fields.reps && !fields.weight && !fields.duration && !fields.distance) {
    res.status(400).send({ msg: 'Select at least one set field for this workout' });
    return;
  }

  const conflictingTemplate = await workoutTemplateCollection.findOne({
    userEmail: req.user.email,
    normalizedName: name.toLowerCase(),
    id: { $ne: existingTemplate.id },
  });

  if (conflictingTemplate) {
    res.status(409).send({ msg: 'A workout with that name already exists' });
    return;
  }

  const updatedTemplate = {
    ...existingTemplate,
    name,
    normalizedName: name.toLowerCase(),
    color: requestedColor || sanitizeWorkoutColor(existingTemplate.color) || getFallbackWorkoutColor(name),
    fields,
    measurements,
  };

  await workoutTemplateCollection.updateOne(
    { id: existingTemplate.id, userEmail: req.user.email },
    { $set: { name, normalizedName: name.toLowerCase(), color: updatedTemplate.color, fields, measurements } }
  );

  await workoutCollection.updateMany(
    {
      userEmail: req.user.email,
      isMixed: { $ne: true },
      $or: [
        { templateId: existingTemplate.id },
        { templateName: existingTemplate.name },
        { exercise: existingTemplate.name },
      ],
    },
    {
      $set: {
        templateName: name,
        exercise: name,
        color: updatedTemplate.color,
        fields,
        measurements,
      },
    }
  );

  const mixedWorkoutsToUpdate = await workoutCollection.find({
    userEmail: req.user.email,
    isMixed: true,
    $or: [
      { 'sets.templateId': existingTemplate.id },
      { 'sets.templateName': existingTemplate.name },
    ],
  }).toArray();

  await Promise.all(
    mixedWorkoutsToUpdate.map((workout) => {
      const updatedSets = Array.isArray(workout.sets)
        ? workout.sets.map((set) => {
          const isMatchingTemplate = set?.templateId === existingTemplate.id || set?.templateName === existingTemplate.name;
          if (!isMatchingTemplate) {
            return set;
          }

          return {
            ...set,
            templateId: existingTemplate.id,
            templateName: name,
            color: updatedTemplate.color,
            fields,
            measurements,
          };
        })
        : [];

      return workoutCollection.updateOne(
        { id: workout.id, userEmail: req.user.email },
        { $set: { sets: updatedSets, updatedAt: new Date().toISOString() } }
      );
    })
  );

  res.send(updatedTemplate);
});

apiRouter.delete('/workout-templates/:id', verifyAuth, async (req, res) => {
  const result = await workoutTemplateCollection.deleteOne({
    id: req.params.id,
    userEmail: req.user.email,
  });

  if (result.deletedCount === 0) {
    res.status(404).send({ msg: 'Workout template not found' });
    return;
  }

  await workoutCollection.deleteMany({
    userEmail: req.user.email,
    $or: [
      { templateId: req.params.id },
      { sets: { $elemMatch: { templateId: req.params.id } } },
    ],
  });

  const remainingTemplates = await workoutTemplateCollection
    .find({ userEmail: req.user.email }, { projection: { id: 1 } })
    .toArray();
  const remainingTemplateIds = remainingTemplates
    .map((template) => template.id)
    .filter(Boolean);

  await workoutCollection.deleteMany({
    userEmail: req.user.email,
    $or: [
      { templateId: { $exists: false } },
      { templateId: null },
      { templateId: '' },
      ...(remainingTemplateIds.length > 0 ? [{ templateId: { $nin: remainingTemplateIds } }] : [{}]),
    ],
  });

  res.status(204).end();
});

// Save a new workout
apiRouter.post('/workouts', verifyAuth, async (req, res) => {
  const templateId = typeof req.body.templateId === 'string' ? req.body.templateId : '';
  const isMixedWorkout = templateId === mixedWorkoutTemplateId;
  const template = isMixedWorkout
    ? null
    : await workoutTemplateCollection.findOne({
      id: templateId,
      userEmail: req.user.email,
    });

  if (typeof req.body.date !== 'string' || !req.body.date) {
    res.status(400).send({ msg: 'Pick a date before saving' });
    return;
  }

  if (!isMixedWorkout && !template) {
    res.status(400).send({ msg: 'Select a registered workout before saving' });
    return;
  }

  const notes = typeof req.body.notes === 'string'
    ? req.body.notes
    : '';
  const starred = Boolean(req.body.starred);
  const sets = Array.isArray(req.body.sets)
    ? isMixedWorkout
      ? (await Promise.all(req.body.sets.map((set, index) => sanitizeMixedSet(set, req.user.email, index)))).filter(Boolean)
      : req.body.sets.map((set, index) => sanitizeSet(set, template.fields, index))
    : [];

  if (sets.length === 0) {
    res.status(400).send({ msg: 'Add at least one set before saving' });
    return;
  }

  const newWorkout = {
    id: uuid.v4(),
    createdAt: new Date().toISOString(),
    userEmail: req.user.email,
    date: req.body.date,
    templateId: isMixedWorkout ? mixedWorkoutTemplateId : template.id,
    templateName: isMixedWorkout ? mixedWorkoutName : template.name,
    exercise: isMixedWorkout ? mixedWorkoutName : template.name,
    isMixed: isMixedWorkout,
    color: isMixedWorkout ? '' : sanitizeWorkoutColor(template.color) || getFallbackWorkoutColor(template.name),
    fields: isMixedWorkout ? buildFieldsFromMixedSets(sets) : template.fields,
    measurements: isMixedWorkout ? sanitizeMeasurements({}) : sanitizeMeasurements(template.measurements),
    notes,
    starred,
    sets,
  };

  await workoutCollection.insertOne(newWorkout);
  res.send(newWorkout);
});

// Get current email
apiRouter.get('/user/me', verifyAuth, (req, res) => {
  res.send({ email: req.user.email, name: req.user.name || '' })
})

// Default error handler
app.use(function (err, req, res, next) {
  res.status(500).send({ type: err.name, message: err.message });
});

// Return the application's default page if the path is unknown
app.use((_req, res) => {
  res.sendFile('index.html', { root: 'public' });
});


async function createUser(name, email, password) {
  const passwordHash = await bcrypt.hash(password, 10);

  const user = {
    name,
    email: email,
    password: passwordHash,
    token: uuid.v4(),
  };
  await userCollection.insertOne(user);

  return user;
}

async function findUser(field, value) {
  if (!value) return null;

  return await userCollection.findOne({ [field]: value });
}

// setAuthCookie in the HTTP response
function setAuthCookie(res, authToken) {
  res.cookie(authCookieName, authToken, {
    maxAge: 1000 * 60 * 60 * 24 * 365,
    secure: true,
    httpOnly: true,
    sameSite: 'strict',
  });
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

function sanitizeSet(set, fields, index) {
  return {
    id: index + 1,
    setType: sanitizeSetType(set?.setType),
    ...(fields.reps ? { reps: `${set?.reps ?? ''}` } : {}),
    ...(fields.weight ? { weight: `${set?.weight ?? ''}` } : {}),
    ...(fields.duration ? { duration: `${set?.duration ?? ''}` } : {}),
    ...(fields.distance ? { distance: `${set?.distance ?? ''}` } : {}),
  };
}

async function sanitizeMixedSet(set, userEmail, index) {
  const templateId = typeof set?.templateId === 'string' ? set.templateId : '';
  const template = await workoutTemplateCollection.findOne({
    id: templateId,
    userEmail,
  });

  if (!template) {
    return null;
  }

  return {
    ...sanitizeSet(set, template.fields, index),
    templateId: template.id,
    templateName: template.name,
    color: sanitizeWorkoutColor(template.color) || getFallbackWorkoutColor(template.name),
    fields: template.fields,
    measurements: sanitizeMeasurements(template.measurements),
  };
}

function buildFieldsFromMixedSets(sets) {
  return {
    reps: sets.some((set) => set?.fields?.reps),
    weight: sets.some((set) => set?.fields?.weight),
    duration: sets.some((set) => set?.fields?.duration),
    distance: sets.some((set) => set?.fields?.distance),
    notes: true,
  };
}

function inferFieldsFromSets(sets) {
  return {
    reps: sets.some((set) => hasValue(set?.reps)),
    weight: sets.some((set) => hasValue(set?.weight)),
    duration: sets.some((set) => hasValue(set?.duration)),
    distance: sets.some((set) => hasValue(set?.distance)),
    notes: true,
  };
}

function hasTrackedFields(fields) {
  return Boolean(fields?.reps || fields?.weight || fields?.duration || fields?.distance);
}

function hasValue(value) {
  return value !== undefined && value !== null && `${value}` !== '';
}

function sanitizeSetType(value) {
  return ['regular', 'warmup', 'max'].includes(value) ? value : 'regular';
}

function sanitizeWorkoutColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '';
}

function sanitizeApprovedWorkoutColor(value) {
  const normalizedColor = sanitizeWorkoutColor(value);
  return workoutColorPalette.includes(normalizedColor) ? normalizedColor : '';
}

function existingTemplateColors(templates) {
  return templates
    .map((template) => sanitizeWorkoutColor(template.color))
    .filter(Boolean);
}

function generateUniqueWorkoutColor(usedColors, seedName) {
  const normalizedUsedColors = new Set(usedColors);
  const paletteColor = workoutColorPalette.find((color) => !normalizedUsedColors.has(color));
  if (paletteColor) {
    return paletteColor;
  }

  let attempt = 0;
  while (attempt < 720) {
    const candidate = buildGeneratedColor(seedName, attempt);
    if (!normalizedUsedColors.has(candidate)) {
      return candidate;
    }
    attempt += 1;
  }

  return getFallbackWorkoutColor(`${seedName}-${Date.now()}`);
}

function getFallbackWorkoutColor(seedName) {
  const safeSeed = `${seedName || 'quicksets'}`;
  const hash = Array.from(safeSeed).reduce((total, character) => total + character.charCodeAt(0), 0);
  return workoutColorPalette[hash % workoutColorPalette.length];
}

function buildGeneratedColor(seedName, attempt) {
  const safeSeed = `${seedName || 'quicksets'}`;
  const hash = Array.from(safeSeed).reduce((total, character) => total + character.charCodeAt(0), 0);
  const hue = Math.round((hash * 137.508 + attempt * 29) % 360);
  const saturation = 68 + (attempt % 3) * 6;
  const lightness = 58 + (attempt % 4) * 4;
  return hslToHex(hue, saturation, lightness);
}

function hslToHex(h, s, l) {
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const huePrime = h / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;

  if (huePrime >= 0 && huePrime < 1) {
    red = chroma;
    green = x;
  } else if (huePrime < 2) {
    red = x;
    green = chroma;
  } else if (huePrime < 3) {
    green = chroma;
    blue = x;
  } else if (huePrime < 4) {
    green = x;
    blue = chroma;
  } else if (huePrime < 5) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }

  const match = lightness - chroma / 2;
  const toHex = (value) => Math.round((value + match) * 255).toString(16).padStart(2, '0');
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
