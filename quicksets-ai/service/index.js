const fs = require('fs');
const path = require('path');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const express = require('express');
const uuid = require('uuid');
const app = express();
const mixedWorkoutTemplateId = '__mixed_workout__';
const mixedWorkoutName = 'Mixed Workout';
const defaultRestDuration = '00:30';
const openAiImportModel = process.env.OPENAI_IMPORT_MODEL || 'gpt-4o-mini';
const openAiApiKey = process.env.OPENAI_API_KEY || readLocalOpenAiApiKey();
const importSourceCharacterLimit = 120000;
const importNotesCharacterLimit = 8000;
const importDuplicateContextCount = 200;
const workoutColorPalette = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
  '#8b5e3c',
  '#94a3b8',
];
const legacyWorkoutColorMap = {
  '#4da3ff': '#3b82f6',
  '#27d7c3': '#3b82f6',
  '#ffba49': '#eab308',
  '#ff7a67': '#ef4444',
  '#c084fc': '#a855f7',
  '#7dd3fc': '#3b82f6',
  '#a3e635': '#22c55e',
  '#fb7185': '#ec4899',
  '#f59e0b': '#f97316',
  '#22c55e': '#22c55e',
};

const authCookieName = 'token';

// The workouts and users are saved in mongo
const { userCollection, workoutCollection, workoutTemplateCollection } = require('./database');

// The service port. In production the front-end code is statically hosted by the service on the same port.
const port = process.argv.length > 2 ? process.argv[2] : 4001;

// JSON body parsing using built-in middleware
app.use(express.json({ limit: '12mb' }));

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
    const payload = await buildUserPayload(user);
    res.send(payload);
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
      const payload = await buildUserPayload(user);
      res.send(payload);
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

  const payload = await buildUserPayload({ ...req.user, name });
  res.send(payload);
});

apiRouter.put('/user/color-preferences', verifyAuth, async (req, res) => {
  const currentPreferences = sanitizeWorkoutColorPreferences(
    req.user?.workoutColorPreferences,
    req.user?.workoutColorLabels
  );
  const nextPreferences = sanitizeWorkoutColorPreferences(
    req.body?.workoutColorPreferences,
    req.user?.workoutColorLabels
  );

  if (workoutColorPreferencesHaveDuplicates(nextPreferences)) {
    res.status(400).send({ msg: 'Each workout color needs to stay unique' });
    return;
  }

  await applyUserColorPreferenceChanges(req.user.email, currentPreferences, nextPreferences);

  await userCollection.updateOne(
    { email: req.user.email },
    {
      $set: {
        workoutColorPreferences: nextPreferences,
        workoutColorLabels: buildColorLabelMapFromPreferences(nextPreferences),
      },
    }
  );

  const payload = await buildUserPayload({
    ...req.user,
    workoutColorPreferences: nextPreferences,
    workoutColorLabels: buildColorLabelMapFromPreferences(nextPreferences),
  });
  res.send(payload);
});

apiRouter.put('/user/color-labels', verifyAuth, async (req, res) => {
  const currentPreferences = sanitizeWorkoutColorPreferences(
    req.user?.workoutColorPreferences,
    req.user?.workoutColorLabels
  );
  const incomingLabels = sanitizeWorkoutColorLabels(req.body?.workoutColorLabels);
  const nextPreferences = workoutColorPalette.reduce((preferences, slotColor) => ({
    ...preferences,
    [slotColor]: {
      ...currentPreferences[slotColor],
      label: incomingLabels[slotColor] || '',
    },
  }), {});

  await userCollection.updateOne(
    { email: req.user.email },
    {
      $set: {
        workoutColorPreferences: nextPreferences,
        workoutColorLabels: buildColorLabelMapFromPreferences(nextPreferences),
      },
    }
  );

  const payload = await buildUserPayload({
    ...req.user,
    workoutColorPreferences: nextPreferences,
    workoutColorLabels: buildColorLabelMapFromPreferences(nextPreferences),
  });
  res.send(payload);
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
  const storedWorkouts = await cursor.toArray();

  const userWorkouts = await Promise.all(storedWorkouts.map(async (workout) => {
    const normalizedColor = workout.isMixed
      ? ''
      : normalizeStoredWorkoutColor(workout.color, workout.templateName || workout.exercise);
    const normalizedSets = Array.isArray(workout.sets)
      ? workout.sets.map((set) => ({
        ...set,
        color: normalizeStoredWorkoutColor(set.color, set.templateName || set.templateId || workout.templateName || workout.exercise),
      }))
      : [];

    const didWorkoutColorChange = normalizedColor !== (workout.color || '');
    const didAnySetColorChange = normalizedSets.some((set, index) => set.color !== workout.sets?.[index]?.color);

    if (didWorkoutColorChange || didAnySetColorChange) {
      await workoutCollection.updateOne(
        { id: workout.id, userEmail: req.user.email },
        {
          $set: {
            color: normalizedColor,
            sets: normalizedSets,
          },
        }
      );
    }

    return {
      ...workout,
      color: workout.isMixed
        ? normalizedColor
        : normalizedColor || getFallbackWorkoutColor(workout.templateName || workout.exercise),
      sets: normalizedSets,
    };
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

apiRouter.post('/workouts/:id/separate', verifyAuth, async (req, res) => {
  const existingWorkout = await workoutCollection.findOne({
    id: req.params.id,
    userEmail: req.user.email,
  });

  if (!existingWorkout) {
    res.status(404).send({ msg: 'Workout not found' });
    return;
  }

  if (!existingWorkout.isMixed) {
    res.status(400).send({ msg: 'Only mixed workouts can be separated' });
    return;
  }

  const sourceSets = Array.isArray(existingWorkout.sets) ? existingWorkout.sets.filter(Boolean) : [];
  if (sourceSets.length === 0) {
    res.status(400).send({ msg: 'This mixed workout has no sets to separate' });
    return;
  }

  const groupedSets = new Map();
  sourceSets.forEach((set) => {
    const templateId = typeof set?.templateId === 'string' ? set.templateId : '';
    const templateName = typeof set?.templateName === 'string' ? set.templateName : '';
    const groupKey = templateId || templateName;

    if (!groupKey) {
      return;
    }

    if (!groupedSets.has(groupKey)) {
      groupedSets.set(groupKey, {
        templateId,
        templateName,
        sets: [],
      });
    }

    groupedSets.get(groupKey).sets.push(set);
  });

  if (groupedSets.size === 0) {
    res.status(400).send({ msg: 'No valid workout sets were found to separate' });
    return;
  }

  const templateIds = Array.from(new Set(
    Array.from(groupedSets.values())
      .map((group) => group.templateId)
      .filter(Boolean)
  ));
  const templates = templateIds.length > 0
    ? await workoutTemplateCollection.find({
      userEmail: req.user.email,
      id: { $in: templateIds },
    }).toArray()
    : [];
  const templateMap = new Map(templates.map((template) => [template.id, template]));
  const baseCreatedAt = Date.parse(existingWorkout.createdAt || '');

  const separatedWorkouts = Array.from(groupedSets.values()).map((group, index) => {
    const template = group.templateId ? templateMap.get(group.templateId) : null;
    const templateName = template?.name || group.templateName || `Workout ${index + 1}`;
    const fields = template?.fields || inferFieldsFromSets(group.sets);
    const normalizedSets = group.sets.map((set, setIndex) => sanitizeSet(set, fields, setIndex));
    const createdAt = Number.isNaN(baseCreatedAt)
      ? new Date().toISOString()
      : new Date(baseCreatedAt + index).toISOString();

    return {
      id: uuid.v4(),
      createdAt,
      userEmail: req.user.email,
      date: existingWorkout.date,
      templateId: template?.id || group.templateId || '',
      templateName,
      exercise: templateName,
      isMixed: false,
      color: normalizeStoredWorkoutColor(template?.color, templateName)
        || normalizeStoredWorkoutColor(group.sets[0]?.color, templateName)
        || getFallbackWorkoutColor(templateName),
      usesRestTimer: template ? Boolean(template.usesRestTimer) : false,
      restDuration: template ? sanitizeRestDuration(template.restDuration) : defaultRestDuration,
      fields,
      measurements: template
        ? sanitizeMeasurements(template.measurements)
        : sanitizeMeasurements(group.sets[0]?.measurements),
      notes: existingWorkout.notes || '',
      starred: Boolean(existingWorkout.starred),
      sets: normalizedSets,
    };
  });

  await workoutCollection.insertMany(separatedWorkouts);
  await workoutCollection.deleteOne({
    id: existingWorkout.id,
    userEmail: req.user.email,
  });

  res.send(separatedWorkouts);
});

apiRouter.get('/workout-templates', verifyAuth, async (req, res) => {
  const cursor = workoutTemplateCollection.find({ userEmail: req.user.email });
  const storedTemplates = await cursor.toArray();
  const templates = await Promise.all(storedTemplates.map(async (template) => {
    const normalizedColor = normalizeStoredWorkoutColor(template.color, template.name);
    if (normalizedColor !== (template.color || '')) {
      await workoutTemplateCollection.updateOne(
        { id: template.id, userEmail: req.user.email },
        { $set: { color: normalizedColor } }
      );
    }

    return {
      ...template,
      color: normalizedColor || getFallbackWorkoutColor(template.name),
      usesRestTimer: Boolean(template.usesRestTimer),
      restDuration: sanitizeRestDuration(template.restDuration),
    };
  }));
  res.send(templates);
});

apiRouter.post('/workout-templates', verifyAuth, async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const requestedColor = sanitizeApprovedWorkoutColor(req.body.color);
  const usesRestTimer = Boolean(req.body.usesRestTimer);
  const restDuration = sanitizeRestDuration(req.body.restDuration);
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
    usesRestTimer,
    restDuration,
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
  const usesRestTimer = Boolean(req.body.usesRestTimer);
  const restDuration = sanitizeRestDuration(req.body.restDuration);
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
    color: requestedColor || normalizeStoredWorkoutColor(existingTemplate.color, name) || getFallbackWorkoutColor(name),
    usesRestTimer,
    restDuration,
    fields,
    measurements,
  };

  await workoutTemplateCollection.updateOne(
    { id: existingTemplate.id, userEmail: req.user.email },
    { $set: { name, normalizedName: name.toLowerCase(), color: updatedTemplate.color, usesRestTimer, restDuration, fields, measurements } }
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
        usesRestTimer,
        restDuration,
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
            usesRestTimer,
            restDuration,
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
  const templateIdToDelete = req.params.id;
  const existingTemplate = await workoutTemplateCollection.findOne({
    id: templateIdToDelete,
    userEmail: req.user.email,
  });

  if (!existingTemplate) {
    res.status(404).send({ msg: 'Workout template not found' });
    return;
  }

  await workoutTemplateCollection.deleteOne({
    id: templateIdToDelete,
    userEmail: req.user.email,
  });

  await workoutCollection.deleteMany({
    userEmail: req.user.email,
    isMixed: { $ne: true },
    $or: [
      { templateId: templateIdToDelete },
      {
        templateId: { $in: [null, ''] },
        $or: [
          { templateName: existingTemplate.name },
          { exercise: existingTemplate.name },
        ],
      },
    ],
  });

  const mixedWorkoutsToUpdate = await workoutCollection.find({
    userEmail: req.user.email,
    isMixed: true,
    sets: { $elemMatch: { templateId: templateIdToDelete } },
  }).toArray();

  await Promise.all(
    mixedWorkoutsToUpdate.map(async (workout) => {
      const updatedSets = Array.isArray(workout.sets)
        ? workout.sets.filter((set) => set?.templateId !== templateIdToDelete)
        : [];

      if (updatedSets.length === 0) {
        await workoutCollection.deleteOne({ id: workout.id, userEmail: req.user.email });
        return;
      }

      await workoutCollection.updateOne(
        { id: workout.id, userEmail: req.user.email },
        {
          $set: {
            sets: updatedSets,
            fields: buildFieldsFromMixedSets(updatedSets),
            updatedAt: new Date().toISOString(),
          },
        }
      );
    })
  );

  const remainingTemplates = await workoutTemplateCollection
    .find({ userEmail: req.user.email }, { projection: { id: 1 } })
    .toArray();
  const remainingTemplateIds = remainingTemplates
    .map((template) => template.id)
    .filter(Boolean);

  const orphanedWorkoutQuery = {
    userEmail: req.user.email,
    isMixed: { $ne: true },
    $or: [
      { templateId: { $exists: false } },
      { templateId: null },
      { templateId: '' },
      { templateId: { $nin: remainingTemplateIds } },
    ],
  };

  await workoutCollection.deleteMany(orphanedWorkoutQuery);

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
    color: isMixedWorkout ? '' : normalizeStoredWorkoutColor(template.color, template.name) || getFallbackWorkoutColor(template.name),
    usesRestTimer: isMixedWorkout ? false : Boolean(template.usesRestTimer),
    restDuration: isMixedWorkout ? defaultRestDuration : sanitizeRestDuration(template.restDuration),
    fields: isMixedWorkout ? buildFieldsFromMixedSets(sets) : template.fields,
    measurements: isMixedWorkout ? sanitizeMeasurements({}) : sanitizeMeasurements(template.measurements),
    notes,
    starred,
    sets,
  };

  await workoutCollection.insertOne(newWorkout);
  res.send(newWorkout);
});

apiRouter.post('/workouts/import/preview', verifyAuth, async (req, res) => {
  try {
    const importSource = await extractWorkoutImportSource(req.body);
    const duplicateContext = await buildWorkoutImportDuplicateContext(req.user.email);
    const preview = await generateWorkoutImportPreview({
      importSource,
      duplicateContext,
      notes: typeof req.body?.notes === 'string' ? req.body.notes : '',
    });

    res.send(preview);
  } catch (err) {
    const status = err?.statusCode || err?.status || 500;
    res.status(status).send({ msg: err?.message || 'Failed to preview imported workouts' });
  }
});

apiRouter.post('/workouts/import/commit', verifyAuth, async (req, res) => {
  try {
    const normalizedPreview = sanitizeWorkoutImportPreviewPayload(req.body);
    const importResult = await commitWorkoutImportPreview(req.user.email, normalizedPreview);
    res.send(importResult);
  } catch (err) {
    const status = err?.statusCode || err?.status || 500;
    res.status(status).send({ msg: err?.message || 'Failed to import workouts' });
  }
});

// Get current email
apiRouter.get('/user/me', verifyAuth, async (req, res) => {
  const payload = await buildUserPayload(req.user);
  res.send(payload)
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
    workoutColorPreferences: sanitizeWorkoutColorPreferences({}),
    workoutColorLabels: {},
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

function sanitizeRestDuration(duration) {
  if (!duration) {
    return defaultRestDuration;
  }

  const seconds = parseDurationToSeconds(duration);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function parseDurationToSeconds(duration) {
  if (!duration) {
    return 30;
  }

  const parts = `${duration}`.split(':').map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part) || part < 0)) {
    return 30;
  }

  if (parts.length === 2) {
    return Math.floor(parts[0] * 60 + parts[1]);
  }

  if (parts.length === 3) {
    return Math.floor(parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }

  const seconds = Number(duration);
  return Number.isNaN(seconds) ? 30 : Math.max(0, Math.floor(seconds));
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
    color: normalizeStoredWorkoutColor(template.color, template.name) || getFallbackWorkoutColor(template.name),
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
  return sanitizeWorkoutColor(value).toLowerCase();
}

function normalizeStoredWorkoutColor(value, seedName = 'quicksets') {
  const normalizedColor = sanitizeWorkoutColor(value).toLowerCase();
  if (!normalizedColor) {
    return '';
  }

  if (workoutColorPalette.includes(normalizedColor)) {
    return normalizedColor;
  }

  if (legacyWorkoutColorMap[normalizedColor]) {
    return legacyWorkoutColorMap[normalizedColor];
  }

  return normalizedColor;
}

function sanitizeWorkoutColorLabels(colorLabels) {
  if (!colorLabels || typeof colorLabels !== 'object' || Array.isArray(colorLabels)) {
    return {};
  }

  return Object.entries(colorLabels).reduce((labels, [color, label]) => {
    const normalizedColor = normalizeStoredWorkoutColor(color);
    const normalizedLabel = `${label ?? ''}`.trim().slice(0, 32);

    if (!normalizedColor || !normalizedLabel || labels[normalizedColor]) {
      return labels;
    }

    return {
      ...labels,
      [normalizedColor]: normalizedLabel,
    };
  }, {});
}

function sanitizeWorkoutColorPreferences(preferences, legacyLabels = {}) {
  const safePreferences = preferences && typeof preferences === 'object' && !Array.isArray(preferences)
    ? preferences
    : {};
  const safeLegacyLabels = sanitizeWorkoutColorLabels(legacyLabels);

  return workoutColorPalette.reduce((normalizedPreferences, slotColor) => {
    const rawEntry = safePreferences[slotColor];
    const normalizedLabel = typeof rawEntry?.label === 'string'
      ? rawEntry.label.trim().slice(0, 32)
      : safeLegacyLabels[slotColor] || '';
    const normalizedColor = sanitizeWorkoutColor(rawEntry?.color).toLowerCase() || slotColor;

    return {
      ...normalizedPreferences,
      [slotColor]: {
        label: normalizedLabel,
        color: normalizedColor,
      },
    };
  }, {});
}

function buildColorLabelMapFromPreferences(preferences) {
  return Object.entries(sanitizeWorkoutColorPreferences(preferences)).reduce((labels, [slotColor, entry]) => {
    if (!entry.label) {
      return labels;
    }

    return {
      ...labels,
      [slotColor]: entry.label,
    };
  }, {});
}

function workoutColorPreferencesHaveDuplicates(preferences) {
  const colors = Object.values(sanitizeWorkoutColorPreferences(preferences)).map((entry) => entry.color);
  return new Set(colors).size !== colors.length;
}

async function applyUserColorPreferenceChanges(userEmail, currentPreferences, nextPreferences) {
  const colorMap = new Map(
    workoutColorPalette
      .map((slotColor) => ([
        currentPreferences?.[slotColor]?.color || slotColor,
        nextPreferences?.[slotColor]?.color || slotColor,
      ]))
      .filter(([previousColor, nextColor]) => previousColor !== nextColor)
  );

  if (colorMap.size === 0) {
    return;
  }

  const templates = await workoutTemplateCollection.find({ userEmail }).toArray();
  await Promise.all(
    templates
      .map((template) => {
        const nextColor = colorMap.get(template.color);
        if (!nextColor || nextColor === template.color) {
          return null;
        }

        return workoutTemplateCollection.updateOne(
          { id: template.id, userEmail },
          { $set: { color: nextColor } }
        );
      })
      .filter(Boolean)
  );

  const workouts = await workoutCollection.find({ userEmail }).toArray();
  await Promise.all(
    workouts
      .map((workout) => {
        const nextWorkoutColor = workout.isMixed ? workout.color : (colorMap.get(workout.color) || workout.color);
        const nextSets = Array.isArray(workout.sets)
          ? workout.sets.map((set) => (
            set?.color && colorMap.has(set.color)
              ? { ...set, color: colorMap.get(set.color) }
              : set
          ))
          : workout.sets;
        const workoutColorChanged = nextWorkoutColor !== workout.color;
        const setColorsChanged = Array.isArray(nextSets)
          && nextSets.some((set, index) => set?.color !== workout.sets?.[index]?.color);

        if (!workoutColorChanged && !setColorsChanged) {
          return null;
        }

        return workoutCollection.updateOne(
          { id: workout.id, userEmail },
          {
            $set: {
              color: nextWorkoutColor,
              sets: nextSets,
            },
          }
        );
      })
      .filter(Boolean)
  );
}

function findNearestWorkoutPaletteColor(color) {
  const sourceRgb = hexToRgb(color);
  if (!sourceRgb) {
    return '';
  }

  let nearestColor = workoutColorPalette[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  workoutColorPalette.forEach((paletteColor) => {
    const paletteRgb = hexToRgb(paletteColor);
    if (!paletteRgb) {
      return;
    }

    const distance = (
      (sourceRgb.r - paletteRgb.r) ** 2
      + (sourceRgb.g - paletteRgb.g) ** 2
      + (sourceRgb.b - paletteRgb.b) ** 2
    );

    if (distance < nearestDistance) {
      nearestColor = paletteColor;
      nearestDistance = distance;
    }
  });

  return nearestColor;
}

function hexToRgb(color) {
  const normalizedColor = sanitizeWorkoutColor(color);
  if (!normalizedColor) {
    return null;
  }

  return {
    r: parseInt(normalizedColor.slice(1, 3), 16),
    g: parseInt(normalizedColor.slice(3, 5), 16),
    b: parseInt(normalizedColor.slice(5, 7), 16),
  };
}

function existingTemplateColors(templates) {
  return templates
    .map((template) => normalizeStoredWorkoutColor(template.color, template.name))
    .filter(Boolean);
}

async function buildUserPayload(user) {
  const workoutColorPreferences = sanitizeWorkoutColorPreferences(
    user?.workoutColorPreferences,
    user?.workoutColorLabels
  );
  const workoutColorLabels = buildColorLabelMapFromPreferences(workoutColorPreferences);
  const currentStoredPreferences = user?.workoutColorPreferences && typeof user.workoutColorPreferences === 'object' && !Array.isArray(user.workoutColorPreferences)
    ? user.workoutColorPreferences
    : {};
  const currentStoredLabels = user?.workoutColorLabels && typeof user.workoutColorLabels === 'object' && !Array.isArray(user.workoutColorLabels)
    ? user.workoutColorLabels
    : {};

  if (
    user?.email
    && (
      stringifyStableObject(workoutColorPreferences) !== stringifyStableObject(currentStoredPreferences)
      || stringifyStableObject(workoutColorLabels) !== stringifyStableObject(currentStoredLabels)
    )
  ) {
    await userCollection.updateOne(
      { email: user.email },
      { $set: { workoutColorPreferences, workoutColorLabels } }
    );
  }

  return {
    email: user?.email || '',
    name: user?.name || '',
    workoutColorPreferences,
    workoutColorLabels,
  };
}

function stringifyStableObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify(value ?? {});
  }

  return JSON.stringify(
    Object.keys(value)
      .sort()
      .reduce((accumulator, key) => ({
        ...accumulator,
        [key]: value[key],
      }), {})
  );
}

function generateUniqueWorkoutColor(usedColors, seedName) {
  const normalizedUsedColors = new Set(usedColors);
  const paletteColor = workoutColorPalette.find((color) => !normalizedUsedColors.has(color));
  if (paletteColor) {
    return paletteColor;
  }

  return getFallbackWorkoutColor(seedName);
}

function getFallbackWorkoutColor(seedName) {
  const safeSeed = `${seedName || 'quicksets'}`;
  const hash = Array.from(safeSeed).reduce((total, character) => total + character.charCodeAt(0), 0);
  return workoutColorPalette[hash % workoutColorPalette.length];
}

async function extractWorkoutImportSource(body) {
  const pastedText = `${body?.pastedText ?? ''}`.trim();
  const fileName = `${body?.fileName ?? ''}`.trim();
  const fileMimeType = `${body?.fileMimeType ?? ''}`.trim();
  const encodedFile = typeof body?.fileContent === 'string' ? body.fileContent : '';
  const hasFile = Boolean(fileName && encodedFile);

  if (!pastedText && !hasFile) {
    throw createHttpError(400, 'Attach a file or paste workout text before importing');
  }

  const parts = [];
  const warnings = [];

  if (hasFile) {
    const fileText = await parseWorkoutImportFile({
      fileName,
      fileMimeType,
      encodedFile,
    });

    if (fileText) {
      parts.push(`File: ${fileName}\n${fileText}`);
    }
  }

  if (pastedText) {
    parts.push(`Pasted text:\n${pastedText}`);
  }

  const combinedText = parts.join('\n\n---\n\n').trim();
  const truncatedText = combinedText.length > importSourceCharacterLimit
    ? combinedText.slice(0, importSourceCharacterLimit)
    : combinedText;

  if (combinedText.length > importSourceCharacterLimit) {
    warnings.push(`Import source was truncated to ${importSourceCharacterLimit.toLocaleString()} characters before sending to AI.`);
  }

  return {
    fileName,
    fileMimeType,
    text: truncatedText,
    warnings,
  };
}

async function parseWorkoutImportFile({ fileName, fileMimeType, encodedFile }) {
  const extension = fileName.toLowerCase().split('.').pop();
  const buffer = Buffer.from(encodedFile, 'base64');

  if (extension === 'csv' || extension === 'txt' || fileMimeType.startsWith('text/')) {
    return buffer.toString('utf8');
  }

  if (extension === 'xlsx' || fileMimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    let xlsx;
    try {
      xlsx = require('xlsx');
    } catch (_err) {
      throw createHttpError(500, 'Excel import support is not installed on the service yet. Run npm install in quicksets-ai/service.');
    }

    const workbook = xlsx.read(buffer, { type: 'buffer' });
    return workbook.SheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
      const renderedRows = rows
        .map((row) => Array.isArray(row) ? row.map((cell) => `${cell ?? ''}`).join('\t').trimEnd() : '')
        .filter(Boolean)
        .join('\n');
      return `Sheet: ${sheetName}\n${renderedRows}`;
    }).join('\n\n');
  }

  throw createHttpError(400, 'That file type is not supported yet. Use .csv, .xlsx, or pasted text.');
}

async function buildWorkoutImportDuplicateContext(userEmail) {
  const [templates, workouts] = await Promise.all([
    workoutTemplateCollection.find({ userEmail }).toArray(),
    workoutCollection.find({ userEmail }).toArray(),
  ]);

  const recentWorkouts = [...workouts]
    .sort(sortWorkoutsForImportContext)
    .slice(0, importDuplicateContextCount)
    .map((workout) => ({
      date: workout.date,
      templateName: workout.templateName || workout.exercise,
      notes: workout.notes || '',
      setCount: Array.isArray(workout.sets) ? workout.sets.length : 0,
      sets: Array.isArray(workout.sets)
        ? workout.sets.map((set) => ({
          setType: sanitizeSetType(set?.setType),
          reps: `${set?.reps ?? ''}`,
          weight: `${set?.weight ?? ''}`,
          duration: `${set?.duration ?? ''}`,
          distance: `${set?.distance ?? ''}`,
        }))
        : [],
    }));

  return {
    templates: templates
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((template) => ({
        name: template.name,
        fields: sanitizeFields(template.fields),
        measurements: sanitizeMeasurements(template.measurements),
        usesRestTimer: Boolean(template.usesRestTimer),
        restDuration: sanitizeRestDuration(template.restDuration),
      })),
    recentWorkouts,
  };
}

async function generateWorkoutImportPreview({ importSource, duplicateContext, notes }) {
  const client = getOpenAiClient();
  const trimmedNotes = `${notes ?? ''}`.trim().slice(0, importNotesCharacterLimit);
  const templateExamples = buildWorkoutTemplateImportExamples();
  const workoutExamples = buildWorkoutImportExamples();
  const response = await client.responses.create({
    model: openAiImportModel,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: [
              'You convert workout logs into structured QuickSets workouts.',
              'Return only valid JSON that matches the provided schema exactly.',
              'The top-level response must contain exactly four keys: templates, workouts, skipped, and warnings.',
              'templates must contain workout template objects only.',
              'workouts must contain workout session objects only.',
              'skipped must contain skipped source items only, each with sourceReference and reason.',
              'warnings must contain plain strings only.',
              'Do not put skipped or uncertain workouts into workouts.',
              'Only return workouts that are new, meaning they are not obvious duplicates of workouts that have already been logged.',
              'Only return workouts that have enough detail to save confidently.',
              'Skip entries that are missing a date, missing a workout name, or missing usable set detail.',
              'If a workout already exists in the provided history, put it in skipped instead of workouts.',
              'Match existing workout templates by name whenever possible.',
              'If a needed template does not exist, include it in templates.',
              'Do not return mixed workouts. If a source log combines multiple exercises on one day, split them into separate workout objects by exercise.',
              'Use 00:MM or HH:MM:SS style durations when needed.',
              'Each workout in workouts should represent one exercise on one date.',
              'Each set object must always include setType, reps, weight, duration, and distance, using empty strings for fields that do not apply.',
              'Follow the example template objects and workout objects closely.',
              'People track workouts differently. Sometimes they log by day instead of by exercise, but you should still output by exercise.',
              'Some logs may require returning hundreds of workouts, and that is okay.',
              'Be decisive and structured. Prefer a confident skip over inventing missing data.',
            ].join(' '),
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: [
              'Return shape requirements:',
              '1. templates: an array of template objects to create or match.',
              '2. workouts: an array of importable workout objects only.',
              '3. skipped: an array of skipped items only, each with sourceReference and reason.',
              '4. warnings: an array of plain warning strings.',
              'Never mix these categories together.',
              'Never put explanatory prose outside those arrays.',
              '',
              'Template object requirements:',
              '- name',
              '- fields with boolean reps, weight, duration, distance',
              '- measurements with weight and distance units',
              '- usesRestTimer boolean',
              '- restDuration string',
              '',
              'Workout object requirements:',
              '- date in YYYY-MM-DD',
              '- templateName',
              '- notes string',
              '- sets array',
              '- every set must include setType, reps, weight, duration, distance',
              '- use empty strings for fields that do not apply',
              '',
              'Skipped object requirements:',
              '- sourceReference should identify the skipped source item as clearly as possible',
              '- reason should explain exactly why it was skipped',
              '',
              'Current workout templates:',
              JSON.stringify(duplicateContext.templates),
              '',
              'Example QuickSets workout templates:',
              JSON.stringify(templateExamples),
              '',
              'Five examples of correctly structured QuickSets workout objects:',
              JSON.stringify(workoutExamples),
              '',
              `Last ${duplicateContext.recentWorkouts.length} workouts for duplicate checking:`,
              JSON.stringify(duplicateContext.recentWorkouts),
              '',
              trimmedNotes ? `Additional notes from the user:\n${trimmedNotes}\n` : '',
              'Import source:',
              importSource.text,
            ].join('\n'),
          },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'quicksets_import_preview',
        strict: true,
        schema: getWorkoutImportPreviewSchema(),
      },
    },
  });

  const parsedPreview = JSON.parse(extractOpenAiTextResponse(response) || '{}');
  const normalizedPreview = sanitizeWorkoutImportPreviewPayload(parsedPreview);

  return {
    ...normalizedPreview,
    warnings: [
      ...importSource.warnings,
      ...normalizedPreview.warnings,
    ],
  };
}

function getOpenAiClient() {
  if (!openAiApiKey) {
    throw createHttpError(503, 'Set OPENAI_API_KEY on the service before importing workouts.');
  }

  let OpenAI;
  try {
    OpenAI = require('openai');
  } catch (_err) {
    throw createHttpError(500, 'OpenAI support is not installed on the service yet. Run npm install in quicksets-ai/service.');
  }

  return new OpenAI({
    apiKey: openAiApiKey,
  });
}

function extractOpenAiTextResponse(response) {
  if (typeof response?.output_text === 'string' && response.output_text) {
    return response.output_text;
  }

  const textContent = Array.isArray(response?.output)
    ? response.output
      .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
      .find((part) => typeof part?.text === 'string')
    : null;

  return textContent?.text || '';
}

function getWorkoutImportPreviewSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      templates: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            fields: {
              type: 'object',
              additionalProperties: false,
              properties: {
                reps: { type: 'boolean' },
                weight: { type: 'boolean' },
                duration: { type: 'boolean' },
                distance: { type: 'boolean' },
              },
              required: ['reps', 'weight', 'duration', 'distance'],
            },
            measurements: {
              type: 'object',
              additionalProperties: false,
              properties: {
                weight: { type: 'string', enum: ['lbs', 'kgs'] },
                distance: { type: 'string', enum: ['miles', 'kms', 'meters', 'feet'] },
              },
              required: ['weight', 'distance'],
            },
            usesRestTimer: { type: 'boolean' },
            restDuration: { type: 'string' },
          },
          required: ['name', 'fields', 'measurements', 'usesRestTimer', 'restDuration'],
        },
      },
      workouts: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            date: { type: 'string' },
            templateName: { type: 'string' },
            notes: { type: 'string' },
            sets: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  setType: { type: 'string', enum: ['regular', 'warmup', 'max'] },
                  reps: { type: 'string' },
                  weight: { type: 'string' },
                  duration: { type: 'string' },
                  distance: { type: 'string' },
                },
                required: ['setType', 'reps', 'weight', 'duration', 'distance'],
              },
            },
          },
          required: ['date', 'templateName', 'notes', 'sets'],
        },
      },
      skipped: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sourceReference: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['sourceReference', 'reason'],
        },
      },
      warnings: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['templates', 'workouts', 'skipped', 'warnings'],
  };
}

function buildWorkoutTemplateImportExamples() {
  return [
    {
      name: 'Bench Press',
      fields: {
        reps: true,
        weight: true,
        duration: false,
        distance: false,
      },
      measurements: {
        weight: 'lbs',
        distance: 'miles',
      },
      usesRestTimer: true,
      restDuration: '01:30',
    },
    {
      name: 'Planks',
      fields: {
        reps: false,
        weight: false,
        duration: true,
        distance: false,
      },
      measurements: {
        weight: 'lbs',
        distance: 'miles',
      },
      usesRestTimer: false,
      restDuration: '00:30',
    },
    {
      name: 'Running',
      fields: {
        reps: false,
        weight: false,
        duration: true,
        distance: true,
      },
      measurements: {
        weight: 'lbs',
        distance: 'miles',
      },
      usesRestTimer: false,
      restDuration: '00:30',
    },
  ];
}

function buildWorkoutImportExamples() {
  return [
    {
      date: '2026-03-10',
      templateName: 'Bench Press',
      notes: '',
      sets: [
        { setType: 'regular', reps: '11', weight: '65', duration: '', distance: '' },
        { setType: 'regular', reps: '11', weight: '65', duration: '', distance: '' },
        { setType: 'regular', reps: '9', weight: '65', duration: '', distance: '' },
      ],
    },
    {
      date: '2026-01-07',
      templateName: 'Planks',
      notes: '',
      sets: [
        { setType: 'regular', reps: '', weight: '', duration: '01:00', distance: '' },
        { setType: 'regular', reps: '', weight: '', duration: '01:00', distance: '' },
        { setType: 'regular', reps: '', weight: '', duration: '02:30', distance: '' },
      ],
    },
    {
      date: '2026-04-09',
      templateName: 'Squats',
      notes: '',
      sets: [
        { setType: 'warmup', reps: '10', weight: '95', duration: '', distance: '' },
        { setType: 'regular', reps: '10', weight: '110', duration: '', distance: '' },
        { setType: 'regular', reps: '10', weight: '110', duration: '', distance: '' },
      ],
    },
    {
      date: '2026-02-20',
      templateName: 'Shrugs',
      notes: '',
      sets: [
        { setType: 'regular', reps: '30', weight: '20', duration: '', distance: '' },
        { setType: 'regular', reps: '30', weight: '25', duration: '', distance: '' },
        { setType: 'max', reps: '20', weight: '30', duration: '', distance: '' },
      ],
    },
    {
      date: '2026-05-02',
      templateName: 'Bodyweight Dips',
      notes: 'Imported from freeform workout notes.',
      sets: [
        { setType: 'regular', reps: '9', weight: '', duration: '', distance: '' },
        { setType: 'regular', reps: '8', weight: '', duration: '', distance: '' },
        { setType: 'regular', reps: '6', weight: '', duration: '', distance: '' },
      ],
    },
  ];
}

function sanitizeWorkoutImportPreviewPayload(payload) {
  const safePayload = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {};

  const normalizedTemplates = Array.isArray(safePayload.templates)
    ? dedupeImportTemplates(
      safePayload.templates
        .map(sanitizeImportedTemplateDefinition)
        .filter(Boolean)
    )
    : [];
  const normalizedWorkouts = Array.isArray(safePayload.workouts)
    ? dedupeImportedWorkouts(
      safePayload.workouts
        .map(sanitizeImportedWorkoutDefinition)
        .filter(Boolean)
    )
    : [];
  const skipped = Array.isArray(safePayload.skipped)
    ? safePayload.skipped
      .map((entry) => ({
        sourceReference: `${entry?.sourceReference ?? ''}`.trim().slice(0, 160),
        reason: `${entry?.reason ?? ''}`.trim().slice(0, 240),
      }))
      .filter((entry) => entry.reason)
    : [];
  const warnings = Array.isArray(safePayload.warnings)
    ? safePayload.warnings
      .map((warning) => `${warning ?? ''}`.trim().slice(0, 240))
      .filter(Boolean)
    : [];

  return {
    templates: normalizedTemplates,
    workouts: normalizedWorkouts,
    skipped,
    warnings,
  };
}

function sanitizeImportedTemplateDefinition(template) {
  const name = `${template?.name ?? ''}`.trim().slice(0, 80);
  if (!name) {
    return null;
  }

  const fields = sanitizeFields(template.fields);
  if (!fields.reps && !fields.weight && !fields.duration && !fields.distance) {
    return null;
  }

  return {
    name,
    fields,
    measurements: sanitizeMeasurements(template.measurements),
    usesRestTimer: Boolean(template.usesRestTimer),
    restDuration: sanitizeRestDuration(template.restDuration),
  };
}

function sanitizeImportedWorkoutDefinition(workout) {
  const date = `${workout?.date ?? ''}`.trim();
  const templateName = `${workout?.templateName ?? ''}`.trim().slice(0, 80);
  const notes = `${workout?.notes ?? ''}`.trim().slice(0, 2000);
  const sets = Array.isArray(workout?.sets)
    ? workout.sets
      .map(sanitizeImportedSetDefinition)
      .filter(Boolean)
    : [];

  if (!isValidWorkoutImportDate(date) || !templateName || sets.length === 0) {
    return null;
  }

  return {
    date,
    templateName,
    notes,
    sets,
  };
}

function sanitizeImportedSetDefinition(set) {
  const sanitizedSet = {
    setType: sanitizeSetType(set?.setType),
    reps: `${set?.reps ?? ''}`.trim().slice(0, 40),
    weight: `${set?.weight ?? ''}`.trim().slice(0, 40),
    duration: `${set?.duration ?? ''}`.trim().slice(0, 40),
    distance: `${set?.distance ?? ''}`.trim().slice(0, 40),
  };

  if (!sanitizedSet.reps && !sanitizedSet.weight && !sanitizedSet.duration && !sanitizedSet.distance) {
    return null;
  }

  return sanitizedSet;
}

function dedupeImportTemplates(templates) {
  const seen = new Set();
  return templates.filter((template) => {
    const key = template.name.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeImportedWorkouts(workouts) {
  const seen = new Set();
  return workouts.filter((workout) => {
    const signature = buildImportedWorkoutSignature(workout);
    if (seen.has(signature)) {
      return false;
    }
    seen.add(signature);
    return true;
  });
}

async function commitWorkoutImportPreview(userEmail, preview) {
  const normalizedPreview = sanitizeWorkoutImportPreviewPayload(preview);
  const skipped = [...normalizedPreview.skipped];
  const normalizedTemplates = await buildFinalImportedTemplateDefinitions(userEmail, normalizedPreview);
  const existingTemplates = await workoutTemplateCollection.find({ userEmail }).toArray();
  const existingTemplateMap = new Map(existingTemplates.map((template) => [template.normalizedName, template]));
  const createdTemplates = [];
  const workingTemplates = [...existingTemplates];

  for (const templateDefinition of normalizedTemplates) {
    const normalizedName = templateDefinition.name.toLowerCase();
    if (existingTemplateMap.has(normalizedName)) {
      continue;
    }

    const createdTemplate = {
      id: uuid.v4(),
      userEmail,
      name: templateDefinition.name,
      normalizedName,
      color: generateUniqueWorkoutColor(existingTemplateColors(workingTemplates), templateDefinition.name),
      usesRestTimer: Boolean(templateDefinition.usesRestTimer),
      restDuration: sanitizeRestDuration(templateDefinition.restDuration),
      fields: sanitizeFields(templateDefinition.fields),
      measurements: sanitizeMeasurements(templateDefinition.measurements),
    };

    await workoutTemplateCollection.insertOne(createdTemplate);
    existingTemplateMap.set(normalizedName, createdTemplate);
    workingTemplates.push(createdTemplate);
    createdTemplates.push(createdTemplate);
  }

  const existingWorkouts = await workoutCollection.find({ userEmail }).toArray();
  const existingWorkoutSignatures = new Set(existingWorkouts.map(buildStoredWorkoutDuplicateSignature));
  const workoutsToInsert = [];

  for (const workoutDefinition of normalizedPreview.workouts) {
    const template = existingTemplateMap.get(workoutDefinition.templateName.toLowerCase());

    if (!template) {
      skipped.push({
        sourceReference: `${workoutDefinition.date} - ${workoutDefinition.templateName}`,
        reason: 'Skipped because no matching workout template could be created.',
      });
      continue;
    }

    const sanitizedSets = workoutDefinition.sets
      .map((set, index) => sanitizeSet(set, template.fields, index))
      .filter((set) => hasImportedSetValue(set, template.fields));

    if (sanitizedSets.length === 0) {
      skipped.push({
        sourceReference: `${workoutDefinition.date} - ${workoutDefinition.templateName}`,
        reason: 'Skipped because the workout did not contain enough set detail to save.',
      });
      continue;
    }

    const newWorkout = {
      id: uuid.v4(),
      createdAt: new Date().toISOString(),
      userEmail,
      date: workoutDefinition.date,
      templateId: template.id,
      templateName: template.name,
      exercise: template.name,
      isMixed: false,
      color: normalizeStoredWorkoutColor(template.color, template.name) || getFallbackWorkoutColor(template.name),
      usesRestTimer: Boolean(template.usesRestTimer),
      restDuration: sanitizeRestDuration(template.restDuration),
      fields: template.fields,
      measurements: sanitizeMeasurements(template.measurements),
      notes: workoutDefinition.notes,
      starred: false,
      sets: sanitizedSets,
    };

    const signature = buildStoredWorkoutDuplicateSignature(newWorkout);
    if (existingWorkoutSignatures.has(signature)) {
      skipped.push({
        sourceReference: `${workoutDefinition.date} - ${workoutDefinition.templateName}`,
        reason: 'Skipped duplicate workout.',
      });
      continue;
    }

    existingWorkoutSignatures.add(signature);
    workoutsToInsert.push(newWorkout);
  }

  if (workoutsToInsert.length > 0) {
    await workoutCollection.insertMany(workoutsToInsert);
  }

  return {
    importedTemplates: createdTemplates,
    importedWorkouts: workoutsToInsert,
    skipped,
  };
}

async function buildFinalImportedTemplateDefinitions(userEmail, preview) {
  const existingTemplates = await workoutTemplateCollection.find({ userEmail }).toArray();
  const templateMap = new Map(
    existingTemplates.map((template) => [template.normalizedName, {
      name: template.name,
      fields: sanitizeFields(template.fields),
      measurements: sanitizeMeasurements(template.measurements),
      usesRestTimer: Boolean(template.usesRestTimer),
      restDuration: sanitizeRestDuration(template.restDuration),
    }])
  );

  preview.templates.forEach((template) => {
    templateMap.set(template.name.toLowerCase(), template);
  });

  preview.workouts.forEach((workout) => {
    const normalizedName = workout.templateName.toLowerCase();
    if (templateMap.has(normalizedName)) {
      return;
    }

    templateMap.set(normalizedName, {
      name: workout.templateName,
      fields: inferFieldsFromSets(workout.sets),
      measurements: sanitizeMeasurements({}),
      usesRestTimer: false,
      restDuration: defaultRestDuration,
    });
  });

  return Array.from(templateMap.values())
    .filter(Boolean)
    .map(sanitizeImportedTemplateDefinition)
    .filter(Boolean);
}

function buildImportedWorkoutSignature(workout) {
  return [
    workout.date,
    workout.templateName.toLowerCase(),
    workout.sets
      .map((set) => [
        sanitizeSetType(set?.setType),
        `${set?.reps ?? ''}`.trim(),
        `${set?.weight ?? ''}`.trim(),
        `${set?.duration ?? ''}`.trim(),
        `${set?.distance ?? ''}`.trim(),
      ].join('|'))
      .join('||'),
  ].join('###');
}

function buildStoredWorkoutDuplicateSignature(workout) {
  return [
    `${workout?.date ?? ''}`.trim(),
    `${workout?.templateName || workout?.exercise || ''}`.trim().toLowerCase(),
    Array.isArray(workout?.sets)
      ? workout.sets.map((set) => [
        sanitizeSetType(set?.setType),
        `${set?.reps ?? ''}`.trim(),
        `${set?.weight ?? ''}`.trim(),
        `${set?.duration ?? ''}`.trim(),
        `${set?.distance ?? ''}`.trim(),
      ].join('|')).join('||')
      : '',
  ].join('###');
}

function hasImportedSetValue(set, fields) {
  return (
    (fields?.reps && hasValue(set?.reps))
    || (fields?.weight && hasValue(set?.weight))
    || (fields?.duration && hasValue(set?.duration))
    || (fields?.distance && hasValue(set?.distance))
  );
}

function isValidWorkoutImportDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function sortWorkoutsForImportContext(left, right) {
  const leftDate = parseDateForImportSort(left.date);
  const rightDate = parseDateForImportSort(right.date);

  if (rightDate !== leftDate) {
    return rightDate - leftDate;
  }

  const leftChronology = Date.parse(left?.createdAt || '') || 0;
  const rightChronology = Date.parse(right?.createdAt || '') || 0;
  return rightChronology - leftChronology;
}

function parseDateForImportSort(value) {
  const time = Date.parse(`${value}T00:00:00`);
  return Number.isNaN(time) ? 0 : time;
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function readLocalOpenAiApiKey() {
  try {
    const configPath = path.join(__dirname, 'openaiConfig.local.json');
    if (!fs.existsSync(configPath)) {
      return '';
    }

    const rawConfig = fs.readFileSync(configPath, 'utf8');
    const parsedConfig = JSON.parse(rawConfig);
    return typeof parsedConfig?.apiKey === 'string' ? parsedConfig.apiKey.trim() : '';
  } catch (_err) {
    return '';
  }
}

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
