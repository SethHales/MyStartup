const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const express = require('express');
const uuid = require('uuid');
const { createWorkoutImportService } = require('./workoutImportService');
const { startGmailInboxPoller } = require('./gmailInboxService');
const { getOpenAiApiKey } = require('./openAiConfig');
const app = express();
const mixedWorkoutTemplateId = '__mixed_workout__';
const mixedWorkoutName = 'Full Workout';
const openAiImportModel = process.env.OPENAI_IMPORT_MODEL || 'gpt-4o-mini';
const openAiApiKey = getOpenAiApiKey();
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
const explorerPreferenceKeys = {
  statCards: ['lastPerformed', 'bestWeight', 'highestReps', 'farthestDistance', 'longestDuration', 'shortestDuration', 'bestPace', 'estimatedOneRepMax'],
  averages: ['averageSetsPerSession', 'averageRepsPerSet', 'averageWeightPerSet', 'averageDistancePerSet', 'averageTimePerSet', 'averagePace'],
  charts: ['performanceTrend', 'weightTrend', 'repsTrend', 'distanceTrend', 'durationTrend', 'paceTrend', 'estimatedOneRepMaxTrend', 'setVolumeTrend', 'monthlyFrequency'],
};
const defaultHistoryViewPreference = 'date';
const historyViewPreferenceValues = new Set(['date', 'group']);

const authCookieName = 'token';

// The workouts and users are saved in mongo
const { userCollection, workoutCollection, workoutTemplateCollection } = require('./database');
const workoutImportService = createWorkoutImportService({
  workoutTemplateCollection,
  workoutCollection,
  uuid,
  openAiImportModel,
  openAiApiKey,
  importSourceCharacterLimit,
  importNotesCharacterLimit,
  importDuplicateContextCount,
  sanitizeFields,
  sanitizeMeasurements,
  sanitizeSetType,
  sanitizeSet,
  inferFieldsFromSets,
  normalizeStoredWorkoutColor,
  getFallbackWorkoutColor,
  generateUniqueWorkoutColor,
  existingTemplateColors,
});

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
  res.clearCookie(authCookieName, getAuthCookieOptions(0));
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
    res.status(400).send({ msg: 'Each exercise color needs to stay unique' });
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

apiRouter.put('/user/history-preferences', verifyAuth, async (req, res) => {
  const historyViewPreference = sanitizeHistoryViewPreference(req.body?.historyViewPreference);

  await userCollection.updateOne(
    { email: req.user.email },
    { $set: { historyViewPreference } }
  );

  const payload = await buildUserPayload({
    ...req.user,
    historyViewPreference,
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
        ...omitLegacySetTimingFields(set),
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
      ...omitLegacySetTimingFields(workout),
      color: workout.isMixed
        ? normalizedColor
        : normalizedColor || getFallbackWorkoutColor(workout.templateName || workout.exercise),
      sets: normalizedSets,
    };
  }));

  res.send(userWorkouts);
});

apiRouter.put('/workouts/reorder-day', verifyAuth, async (req, res) => {
  const date = typeof req.body?.date === 'string' ? req.body.date : '';
  const orderedWorkoutIds = sanitizeStringArray(req.body?.orderedWorkoutIds);

  if (!date || orderedWorkoutIds.length < 2) {
    res.status(400).send({ msg: 'Choose at least two sessions from the same day to reorder' });
    return;
  }

  const matchingWorkouts = await workoutCollection.find({
    userEmail: req.user.email,
    date,
    id: { $in: orderedWorkoutIds },
  }, { projection: { id: 1 } }).toArray();
  const matchingWorkoutIds = new Set(matchingWorkouts.map((workout) => workout.id));

  if (matchingWorkoutIds.size !== orderedWorkoutIds.length) {
    res.status(400).send({ msg: 'Only sessions from the selected day can be reordered together' });
    return;
  }

  const updatedAt = new Date().toISOString();
  await Promise.all(
    orderedWorkoutIds.map((workoutId, index) =>
      workoutCollection.updateOne(
        { userEmail: req.user.email, date, id: workoutId },
        { $set: { dayOrder: index, updatedAt } }
      )
    )
  );

  res.send({
    date,
    orderedWorkoutIds,
  });
});

apiRouter.put('/workouts/:id', verifyAuth, async (req, res) => {
  const existingWorkout = await workoutCollection.findOne({
    id: req.params.id,
    userEmail: req.user.email,
  });

  if (!existingWorkout) {
    res.status(404).send({ msg: 'Session not found' });
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
    res.status(404).send({ msg: 'Session not found' });
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
    res.status(404).send({ msg: 'Session not found' });
    return;
  }

  if (!existingWorkout.isMixed) {
    res.status(400).send({ msg: 'Only full workouts can be separated' });
    return;
  }

  const sourceSets = Array.isArray(existingWorkout.sets) ? existingWorkout.sets.filter(Boolean) : [];
  if (sourceSets.length === 0) {
    res.status(400).send({ msg: 'This full workout has no sets to separate' });
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
    res.status(400).send({ msg: 'No valid exercise sets were found to separate' });
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
    const templateName = template?.name || group.templateName || `Exercise ${index + 1}`;
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
      ...omitLegacySetTimingFields(template),
      color: normalizedColor || getFallbackWorkoutColor(template.name),
      ...(template.explorerPreferences ? { explorerPreferences: sanitizeExplorerPreferences(template.explorerPreferences) } : {}),
    };
  }));
  res.send(templates);
});

apiRouter.post('/workout-templates', verifyAuth, async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const requestedColor = sanitizeApprovedWorkoutColor(req.body.color);
  const fields = sanitizeFields(req.body.fields);
  const measurements = sanitizeMeasurements(req.body.measurements);

  if (!name) {
    res.status(400).send({ msg: 'Exercise name is required' });
    return;
  }

  if (!fields.reps && !fields.weight && !fields.duration && !fields.distance) {
    res.status(400).send({ msg: 'Select at least one set field for this exercise' });
    return;
  }

  const existingTemplate = await workoutTemplateCollection.findOne({
    userEmail: req.user.email,
    normalizedName: name.toLowerCase(),
  });

  if (existingTemplate) {
    res.status(409).send({ msg: 'An exercise with that name already exists' });
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
    ...(req.body.explorerPreferences ? { explorerPreferences: sanitizeExplorerPreferences(req.body.explorerPreferences) } : {}),
  };

  await workoutTemplateCollection.insertOne(template);
  res.send(template);
});

apiRouter.put('/workout-templates/group', verifyAuth, async (req, res) => {
  const templateIds = sanitizeStringArray(req.body?.templateIds);
  const requestedColor = sanitizeWorkoutColor(req.body?.color).toLowerCase();

  if (templateIds.length === 0) {
    res.status(400).send({ msg: 'Select at least one exercise' });
    return;
  }

  if (!requestedColor) {
    res.status(400).send({ msg: 'Pick a valid exercise group color' });
    return;
  }

  const templates = await workoutTemplateCollection.find({
    userEmail: req.user.email,
    id: { $in: templateIds },
  }).toArray();

  if (templates.length !== templateIds.length) {
    res.status(404).send({ msg: 'One or more selected exercises could not be found' });
    return;
  }

  await workoutTemplateCollection.updateMany(
    { userEmail: req.user.email, id: { $in: templateIds } },
    { $set: { color: requestedColor } }
  );

  await workoutCollection.updateMany(
    {
      userEmail: req.user.email,
      isMixed: { $ne: true },
      templateId: { $in: templateIds },
    },
    { $set: { color: requestedColor } }
  );

  const mixedWorkoutsToUpdate = await workoutCollection.find({
    userEmail: req.user.email,
    isMixed: true,
    sets: { $elemMatch: { templateId: { $in: templateIds } } },
  }).toArray();

  await Promise.all(
    mixedWorkoutsToUpdate.map((workout) => {
      const updatedSets = Array.isArray(workout.sets)
        ? workout.sets.map((set) => (
          templateIds.includes(set?.templateId)
            ? { ...set, color: requestedColor }
            : set
        ))
        : [];

      return workoutCollection.updateOne(
        { id: workout.id, userEmail: req.user.email },
        { $set: { sets: updatedSets, updatedAt: new Date().toISOString() } }
      );
    })
  );

  res.send({
    updatedTemplateIds: templateIds,
    color: requestedColor,
  });
});

apiRouter.post('/workout-templates/merge', verifyAuth, async (req, res) => {
  const templateIds = sanitizeStringArray(req.body?.templateIds);
  const requestedTargetId = typeof req.body?.targetTemplateId === 'string'
    ? req.body.targetTemplateId
    : '';
  const targetTemplateId = requestedTargetId && templateIds.includes(requestedTargetId)
    ? requestedTargetId
    : templateIds[0];

  if (templateIds.length < 2) {
    res.status(400).send({ msg: 'Select at least two exercises to merge' });
    return;
  }

  const templates = await workoutTemplateCollection.find({
    userEmail: req.user.email,
    id: { $in: templateIds },
  }).toArray();

  if (templates.length !== templateIds.length) {
    res.status(404).send({ msg: 'One or more selected exercises could not be found' });
    return;
  }

  const templateMap = new Map(templates.map((template) => [template.id, template]));
  const targetTemplate = templateMap.get(targetTemplateId);

  if (!targetTemplate) {
    res.status(400).send({ msg: 'Choose an exercise to merge into' });
    return;
  }

  const targetFields = sanitizeFields(targetTemplate.fields);
  const mismatchedTemplate = templates.find((template) => !doTrackedFieldsMatch(targetFields, sanitizeFields(template.fields)));

  if (mismatchedTemplate) {
    res.status(400).send({ msg: 'Selected exercises must use the same fields before they can be merged' });
    return;
  }

  const sourceTemplates = templates.filter((template) => template.id !== targetTemplate.id);
  const sourceTemplateIds = sourceTemplates.map((template) => template.id);
  const sourceTemplateNames = sourceTemplates.map((template) => template.name);
  const targetColor = normalizeStoredWorkoutColor(targetTemplate.color, targetTemplate.name) || getFallbackWorkoutColor(targetTemplate.name);
  const targetMeasurements = sanitizeMeasurements(targetTemplate.measurements);

  await workoutCollection.updateMany(
    {
      userEmail: req.user.email,
      isMixed: { $ne: true },
      $or: [
        { templateId: { $in: sourceTemplateIds } },
        {
          templateId: { $in: [null, ''] },
          $or: [
            { templateName: { $in: sourceTemplateNames } },
            { exercise: { $in: sourceTemplateNames } },
          ],
        },
      ],
    },
    {
      $set: {
        templateId: targetTemplate.id,
        templateName: targetTemplate.name,
        exercise: targetTemplate.name,
        color: targetColor,
        fields: targetFields,
        measurements: targetMeasurements,
        updatedAt: new Date().toISOString(),
      },
    }
  );

  const mixedWorkoutsToUpdate = await workoutCollection.find({
    userEmail: req.user.email,
    isMixed: true,
    $or: [
      { 'sets.templateId': { $in: sourceTemplateIds } },
      { 'sets.templateName': { $in: sourceTemplateNames } },
    ],
  }).toArray();

  await Promise.all(
    mixedWorkoutsToUpdate.map((workout) => {
      const updatedSets = Array.isArray(workout.sets)
        ? workout.sets.map((set) => {
          const isSourceTemplate = sourceTemplateIds.includes(set?.templateId)
            || sourceTemplateNames.includes(set?.templateName);

          if (!isSourceTemplate) {
            return set;
          }

          return {
            ...set,
            templateId: targetTemplate.id,
            templateName: targetTemplate.name,
            color: targetColor,
            fields: targetFields,
            measurements: targetMeasurements,
          };
        })
        : [];

      return workoutCollection.updateOne(
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

  await workoutTemplateCollection.deleteMany({
    userEmail: req.user.email,
    id: { $in: sourceTemplateIds },
  });

  res.send({
    targetTemplate: {
      ...omitLegacySetTimingFields(targetTemplate),
      color: targetColor,
      fields: targetFields,
      measurements: targetMeasurements,
    },
    mergedTemplateIds: sourceTemplateIds,
  });
});

apiRouter.put('/workout-templates/:id', verifyAuth, async (req, res) => {
  const existingTemplate = await workoutTemplateCollection.findOne({
    id: req.params.id,
    userEmail: req.user.email,
  });

  if (!existingTemplate) {
    res.status(404).send({ msg: 'Exercise not found' });
    return;
  }

  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const requestedColor = sanitizeApprovedWorkoutColor(req.body.color);
  const fields = sanitizeFields(req.body.fields);
  const measurements = sanitizeMeasurements(req.body.measurements);

  if (!name) {
    res.status(400).send({ msg: 'Exercise name is required' });
    return;
  }

  if (!fields.reps && !fields.weight && !fields.duration && !fields.distance) {
    res.status(400).send({ msg: 'Select at least one set field for this exercise' });
    return;
  }

  const conflictingTemplate = await workoutTemplateCollection.findOne({
    userEmail: req.user.email,
    normalizedName: name.toLowerCase(),
    id: { $ne: existingTemplate.id },
  });

  if (conflictingTemplate) {
    res.status(409).send({ msg: 'An exercise with that name already exists' });
    return;
  }

  const updatedTemplate = {
    ...existingTemplate,
    name,
    normalizedName: name.toLowerCase(),
    color: requestedColor || normalizeStoredWorkoutColor(existingTemplate.color, name) || getFallbackWorkoutColor(name),
    fields,
    measurements,
    explorerPreferences: req.body.explorerPreferences
      ? sanitizeExplorerPreferences(req.body.explorerPreferences)
      : existingTemplate.explorerPreferences,
  };

  await workoutTemplateCollection.updateOne(
    { id: existingTemplate.id, userEmail: req.user.email },
    {
      $set: {
        name,
        normalizedName: name.toLowerCase(),
        color: updatedTemplate.color,
        fields,
        measurements,
        ...(updatedTemplate.explorerPreferences ? { explorerPreferences: updatedTemplate.explorerPreferences } : {}),
      },
    }
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

  res.send(omitLegacySetTimingFields(updatedTemplate));
});

apiRouter.put('/workout-templates/:id/explorer-preferences', verifyAuth, async (req, res) => {
  const existingTemplate = await workoutTemplateCollection.findOne({
    id: req.params.id,
    userEmail: req.user.email,
  });

  if (!existingTemplate) {
    res.status(404).send({ msg: 'Exercise not found' });
    return;
  }

  const explorerPreferences = sanitizeExplorerPreferences(req.body);

  await workoutTemplateCollection.updateOne(
    { id: existingTemplate.id, userEmail: req.user.email },
    { $set: { explorerPreferences } }
  );

  res.send({
    ...omitLegacySetTimingFields(existingTemplate),
    color: normalizeStoredWorkoutColor(existingTemplate.color, existingTemplate.name) || getFallbackWorkoutColor(existingTemplate.name),
    explorerPreferences,
  });
});

apiRouter.delete('/workout-templates/:id', verifyAuth, async (req, res) => {
  const templateIdToDelete = req.params.id;
  const existingTemplate = await workoutTemplateCollection.findOne({
    id: templateIdToDelete,
    userEmail: req.user.email,
  });

  if (!existingTemplate) {
    res.status(404).send({ msg: 'Exercise not found' });
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
    res.status(400).send({ msg: 'Select a registered exercise before saving' });
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
    const importSource = await workoutImportService.extractWorkoutImportSource(req.body);
    const duplicateContext = await workoutImportService.buildWorkoutImportDuplicateContext(req.user.email);
    const preview = await workoutImportService.generateWorkoutImportPreview({
      importSource,
      duplicateContext,
      notes: typeof req.body?.notes === 'string' ? req.body.notes : '',
    });

    res.send(preview);
  } catch (err) {
    const status = err?.statusCode || err?.status || 500;
    res.status(status).send({ msg: err?.message || 'Failed to preview imported sessions' });
  }
});

apiRouter.post('/workouts/import/commit', verifyAuth, async (req, res) => {
  try {
    const normalizedPreview = workoutImportService.sanitizeWorkoutImportPreviewPayload(req.body);
    const importResult = await workoutImportService.commitWorkoutImportPreview(req.user.email, normalizedPreview);
    res.send(importResult);
  } catch (err) {
    const status = err?.statusCode || err?.status || 500;
    res.status(status).send({ msg: err?.message || 'Failed to import sessions' });
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
    historyViewPreference: defaultHistoryViewPreference,
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
  res.cookie(authCookieName, authToken, getAuthCookieOptions());
}

function getAuthCookieOptions(maxAge = 1000 * 60 * 60 * 24 * 365) {
  const options = {
    maxAge,
    secure: true,
    httpOnly: true,
    sameSite: 'strict',
  };

  if (process.env.NODE_ENV === 'production') {
    options.domain = '.quicksets.net';
  }

  return options;
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

function sanitizeExplorerPreferences(preferences) {
  const safePreferences = preferences && typeof preferences === 'object' && !Array.isArray(preferences)
    ? preferences
    : {};

  return {
    statCards: sanitizeExplorerPreferenceSection(safePreferences.statCards, explorerPreferenceKeys.statCards),
    averages: sanitizeExplorerPreferenceSection(safePreferences.averages, explorerPreferenceKeys.averages),
    charts: sanitizeExplorerPreferenceSection(safePreferences.charts, explorerPreferenceKeys.charts),
    statCardOrder: sanitizeExplorerPreferenceOrder(safePreferences.statCardOrder, explorerPreferenceKeys.statCards),
    averageOrder: sanitizeExplorerPreferenceOrder(safePreferences.averageOrder, explorerPreferenceKeys.averages),
    chartOrder: sanitizeExplorerPreferenceOrder(safePreferences.chartOrder, explorerPreferenceKeys.charts),
  };
}

function sanitizeExplorerPreferenceSection(section, allowedKeys) {
  const safeSection = section && typeof section === 'object' && !Array.isArray(section)
    ? section
    : {};

  return allowedKeys.reduce((normalizedSection, key) => {
    if (typeof safeSection[key] !== 'boolean') {
      return normalizedSection;
    }

    return {
      ...normalizedSection,
      [key]: safeSection[key],
    };
  }, {});
}

function sanitizeExplorerPreferenceOrder(order, allowedKeys) {
  if (!Array.isArray(order)) {
    return [];
  }

  const seen = new Set();
  return order.filter((key) => {
    if (typeof key !== 'string' || !allowedKeys.includes(key) || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
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

function sanitizeStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  const seen = new Set();
  return values
    .map((value) => typeof value === 'string' ? value.trim() : '')
    .filter((value) => {
      if (!value || seen.has(value)) {
        return false;
      }

      seen.add(value);
      return true;
    });
}

function sanitizeHistoryViewPreference(value) {
  return historyViewPreferenceValues.has(value) ? value : defaultHistoryViewPreference;
}

function omitLegacySetTimingFields(document = {}) {
  const blockedKeys = new Set([
    ['uses', 'Rest', 'Timer'].join(''),
    ['rest', 'Duration'].join(''),
  ]);

  return Object.fromEntries(
    Object.entries(document || {}).filter(([key]) => !blockedKeys.has(key))
  );
}

function doTrackedFieldsMatch(leftFields, rightFields) {
  const left = sanitizeFields(leftFields);
  const right = sanitizeFields(rightFields);

  return left.reps === right.reps
    && left.weight === right.weight
    && left.duration === right.duration
    && left.distance === right.distance;
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
  const historyViewPreference = sanitizeHistoryViewPreference(user?.historyViewPreference);
  const currentStoredPreferences = user?.workoutColorPreferences && typeof user.workoutColorPreferences === 'object' && !Array.isArray(user.workoutColorPreferences)
    ? user.workoutColorPreferences
    : {};
  const currentStoredLabels = user?.workoutColorLabels && typeof user.workoutColorLabels === 'object' && !Array.isArray(user.workoutColorLabels)
    ? user.workoutColorLabels
    : {};
  const shouldNormalizeHistoryViewPreference = user?.historyViewPreference !== historyViewPreference;

  if (
    user?.email
    && (
      stringifyStableObject(workoutColorPreferences) !== stringifyStableObject(currentStoredPreferences)
      || stringifyStableObject(workoutColorLabels) !== stringifyStableObject(currentStoredLabels)
      || shouldNormalizeHistoryViewPreference
    )
  ) {
    await userCollection.updateOne(
      { email: user.email },
      { $set: { workoutColorPreferences, workoutColorLabels, historyViewPreference } }
    );
  }

  return {
    email: user?.email || '',
    name: user?.name || '',
    workoutColorPreferences,
    workoutColorLabels,
    historyViewPreference,
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

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
  startGmailInboxPoller();
});
