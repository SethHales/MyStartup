const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const express = require('express');
const uuid = require('uuid');
const app = express();
const http = require('http');
const { peerProxy, broadcastNotification } = require('./peerProxy');

const authCookieName = 'token';

// The workouts and users are saved in mongo
const { userCollection, workoutCollection } = require('./database');

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
    broadcastNotification(`${user.email} just created an account!`, user.email);
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
      broadcastNotification(`${user.email} just logged in!`, user.email);
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

// Middleware to verify that the user is authorized to call an endpoint
const verifyAuth = async (req, res, next) => {
  const user = await findUser('token', req.cookies[authCookieName]);
  if (user) {
    req.user = user;
    next();
  } else {
    res.status(401).send({ msg: 'Unauthorized' });
  }
};

// Workouts
apiRouter.get('/workouts', verifyAuth, async (req, res) => {
  const cursor = workoutCollection.find({ userEmail: req.user.email });
  const userWorkouts = await cursor.toArray();
  res.send(userWorkouts);
});

// Save a new workout
apiRouter.post('/workouts', verifyAuth, async (req, res) => {
  const newWorkout = {
    id: uuid.v4(),
    userEmail: req.user.email,
    date: req.body.date,
    exercise: req.body.exercise,
    notes: req.body.notes,
    sets: req.body.sets || [],
  };
  
  await workoutCollection.insertOne(newWorkout);
  broadcastNotification(`${req.user.email} saved a workout!`, req.user.email);
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

const httpServer = http.createServer(app);
peerProxy(httpServer);

httpServer.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
