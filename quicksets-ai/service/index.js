const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const express = require('express');
const uuid = require('uuid');
const app = express();

const authCookieName = 'token';

// The workouts and users are saved in mongo
const { userCollection, workoutCollection, workoutTemplateCollection } = require('./database');

// The service port. In production the front-end code is statically hosted by the service on the same port.
const port = process.argv.length > 2 ? process.argv[2] : 4000;

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
    const user = await createUser(req.body.email, req.body.password);

    setAuthCookie(res, user.token);
    res.send({ email: user.email });
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
      res.send({ email: user.email });
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
  const userWorkouts = await cursor.toArray();
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
  const sets = Array.isArray(req.body.sets)
    ? req.body.sets.map((set, index) => sanitizeSet(set, existingWorkout.fields || {}, index))
    : existingWorkout.sets;

  const updatedWorkout = {
    ...existingWorkout,
    date,
    notes,
    starred,
    sets,
  };

  await workoutCollection.updateOne(
    { id: existingWorkout.id, userEmail: req.user.email },
    { $set: { date, notes, starred, sets } }
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
  const templates = await cursor.toArray();
  res.send(templates);
});

apiRouter.post('/workout-templates', verifyAuth, async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
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
    fields,
    measurements,
  };

  await workoutTemplateCollection.updateOne(
    { id: existingTemplate.id, userEmail: req.user.email },
    { $set: { name, normalizedName: name.toLowerCase(), fields, measurements } }
  );

  await workoutCollection.updateMany(
    { templateId: existingTemplate.id, userEmail: req.user.email },
    {
      $set: {
        templateName: name,
        exercise: name,
        fields,
        measurements,
      },
    }
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

  res.status(204).end();
});

// Save a new workout
apiRouter.post('/workouts', verifyAuth, async (req, res) => {
  const templateId = typeof req.body.templateId === 'string' ? req.body.templateId : '';
  const template = await workoutTemplateCollection.findOne({
    id: templateId,
    userEmail: req.user.email,
  });

  if (typeof req.body.date !== 'string' || !req.body.date) {
    res.status(400).send({ msg: 'Pick a date before saving' });
    return;
  }

  if (!template) {
    res.status(400).send({ msg: 'Select a registered workout before saving' });
    return;
  }

  const notes = typeof req.body.notes === 'string'
    ? req.body.notes
    : '';
  const starred = Boolean(req.body.starred);
  const sets = Array.isArray(req.body.sets)
    ? req.body.sets.map((set, index) => sanitizeSet(set, template.fields, index))
    : [];

  if (sets.length === 0) {
    res.status(400).send({ msg: 'Add at least one set before saving' });
    return;
  }

  const newWorkout = {
    id: uuid.v4(),
    userEmail: req.user.email,
    date: req.body.date,
    templateId: template.id,
    templateName: template.name,
    exercise: template.name,
    fields: template.fields,
    measurements: sanitizeMeasurements(template.measurements),
    notes,
    starred,
    sets,
  };

  await workoutCollection.insertOne(newWorkout);
  res.send(newWorkout);
});

// Get current email
apiRouter.get('/user/me', verifyAuth, (req, res) => {
  res.send({ email: req.user.email })
})

// Default error handler
app.use(function (err, req, res, next) {
  res.status(500).send({ type: err.name, message: err.message });
});

// Return the application's default page if the path is unknown
app.use((_req, res) => {
  res.sendFile('index.html', { root: 'public' });
});


async function createUser(email, password) {
  const passwordHash = await bcrypt.hash(password, 10);

  const user = {
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

function sanitizeSetType(value) {
  return ['regular', 'warmup', 'max'].includes(value) ? value : 'regular';
}

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
