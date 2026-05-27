const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const express = require('express');
const uuid = require('uuid');

const app = express();
const authCookieName = 'token';
const port = process.argv.length > 2 ? Number(process.argv[2]) : 4000;

const { userCollection, studySessionCollection } = require('./database');

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(express.static('public'));

const apiRouter = express.Router();
app.use('/api', apiRouter);

apiRouter.post('/auth/create', async (req, res) => {
  if (await findUser('email', req.body.email)) {
    res.status(409).send({ msg: 'Existing user' });
    return;
  }

  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (!name) {
    res.status(400).send({ msg: 'Name is required' });
    return;
  }

  const user = await createUser(name, req.body.email, req.body.password);
  setAuthCookie(res, user.token);
  res.send(buildUserPayload(user));
});

apiRouter.post('/auth/login', async (req, res) => {
  const user = await findUser('email', req.body.email);
  if (user && await bcrypt.compare(req.body.password, user.password)) {
    user.token = uuid.v4();
    await userCollection.updateOne(
      { email: user.email },
      { $set: { token: user.token } }
    );

    setAuthCookie(res, user.token);
    res.send(buildUserPayload(user));
    return;
  }

  res.status(401).send({ msg: 'Unauthorized' });
});

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

apiRouter.get('/user/me', verifyAuth, async (req, res) => {
  res.send(buildUserPayload(req.user));
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

  res.send(buildUserPayload({ ...req.user, name }));
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

apiRouter.get('/study-sessions', verifyAuth, async (req, res) => {
  const sessions = await studySessionCollection.find({ userEmail: req.user.email }).toArray();
  res.send(sortSessions(sessions));
});

apiRouter.post('/study-sessions', verifyAuth, async (req, res) => {
  const normalizedSession = sanitizeStudySessionInput(req.body);

  if (!normalizedSession.date) {
    res.status(400).send({ msg: 'Choose a date before saving' });
    return;
  }

  if (normalizedSession.duration === '00:00:00') {
    res.status(400).send({ msg: 'Log at least one minute of study time' });
    return;
  }

  const newSession = {
    id: uuid.v4(),
    userEmail: req.user.email,
    date: normalizedSession.date,
    duration: normalizedSession.duration,
    content: normalizedSession.content,
    notes: normalizedSession.notes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await studySessionCollection.insertOne(newSession);
  res.send(newSession);
});

apiRouter.put('/study-sessions/:id', verifyAuth, async (req, res) => {
  const existingSession = await studySessionCollection.findOne({
    id: req.params.id,
    userEmail: req.user.email,
  });

  if (!existingSession) {
    res.status(404).send({ msg: 'Study session not found' });
    return;
  }

  const normalizedSession = sanitizeStudySessionInput(req.body);

  if (!normalizedSession.date) {
    res.status(400).send({ msg: 'Choose a date before saving' });
    return;
  }

  if (normalizedSession.duration === '00:00:00') {
    res.status(400).send({ msg: 'Log at least one minute of study time' });
    return;
  }

  const updatedSession = {
    ...existingSession,
    date: normalizedSession.date,
    duration: normalizedSession.duration,
    content: normalizedSession.content,
    notes: normalizedSession.notes,
    updatedAt: new Date().toISOString(),
  };

  await studySessionCollection.updateOne(
    { id: existingSession.id, userEmail: req.user.email },
    {
      $set: {
        date: updatedSession.date,
        duration: updatedSession.duration,
        content: updatedSession.content,
        notes: updatedSession.notes,
        updatedAt: updatedSession.updatedAt,
      },
    }
  );

  res.send(updatedSession);
});

apiRouter.delete('/study-sessions/:id', verifyAuth, async (req, res) => {
  const result = await studySessionCollection.deleteOne({
    id: req.params.id,
    userEmail: req.user.email,
  });

  if (result.deletedCount === 0) {
    res.status(404).send({ msg: 'Study session not found' });
    return;
  }

  res.status(204).end();
});

async function verifyAuth(req, res, next) {
  const user = await findUser('token', req.cookies[authCookieName]);
  if (user) {
    req.user = user;
    next();
    return;
  }

  res.status(401).send({ msg: 'Unauthorized' });
}

app.use((_err, _req, res, _next) => {
  res.status(500).send({ type: 'ServerError', message: 'Something went wrong' });
});

app.use((_req, res) => {
  res.sendFile('index.html', { root: 'public' });
});

async function createUser(name, email, password) {
  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    name,
    email,
    password: passwordHash,
    token: uuid.v4(),
  };

  await userCollection.insertOne(user);
  return user;
}

async function findUser(field, value) {
  if (!value) {
    return null;
  }

  return userCollection.findOne({ [field]: value });
}

function buildUserPayload(user) {
  return {
    email: user?.email || '',
    name: user?.name || '',
  };
}

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

function sanitizeStudySessionInput(input) {
  return {
    date: sanitizeDate(input?.date),
    duration: sanitizeDuration(input?.duration),
    content: typeof input?.content === 'string' ? input.content.trim().slice(0, 500) : '',
    notes: typeof input?.notes === 'string' ? input.notes.trim().slice(0, 4000) : '',
  };
}

function sanitizeDate(value) {
  const normalizedValue = `${value ?? ''}`.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizedValue) ? normalizedValue : '';
}

function sanitizeDuration(value) {
  const [hours, minutes, seconds] = `${value ?? '00:00:00'}`
    .split(':')
    .map((part) => Number(part));

  if (
    !Number.isFinite(hours)
    || !Number.isFinite(minutes)
    || !Number.isFinite(seconds)
    || hours < 0
    || minutes < 0
    || minutes > 59
    || seconds < 0
    || seconds > 59
  ) {
    return '00:00:00';
  }

  return `${String(Math.floor(hours)).padStart(2, '0')}:${String(Math.floor(minutes)).padStart(2, '0')}:${String(Math.floor(seconds)).padStart(2, '0')}`;
}

function sortSessions(sessions) {
  return [...sessions].sort((left, right) => {
    const leftDate = Date.parse(`${left.date}T00:00:00`) || 0;
    const rightDate = Date.parse(`${right.date}T00:00:00`) || 0;

    if (rightDate !== leftDate) {
      return rightDate - leftDate;
    }

    const leftCreated = Date.parse(left.createdAt || '') || 0;
    const rightCreated = Date.parse(right.createdAt || '') || 0;
    return rightCreated - leftCreated;
  });
}

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
