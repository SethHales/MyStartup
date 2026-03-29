const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');
const config = require('./dbConfig.json');

const email = 'blah@blah.com';
const password = 'blah';

const url = `mongodb+srv://${encodeURIComponent(config.userName)}:${encodeURIComponent(config.password)}@${config.hostname}/?appName=Cluster0`;
const client = new MongoClient(url);
const db = client.db('quicksets');

const userCollection = db.collection('user');
const workoutCollection = db.collection('workout');
const workoutTemplateCollection = db.collection('workoutTemplate');

const templateSeeds = [
  { name: 'Bench Press', fields: { reps: true, weight: true, duration: false, distance: false, notes: true } },
  { name: 'Incline Dumbbell Press', fields: { reps: true, weight: true, duration: false, distance: false, notes: true } },
  { name: 'Weighted Pull-Up', fields: { reps: true, weight: true, duration: false, distance: false, notes: true } },
  { name: 'Back Squat', fields: { reps: true, weight: true, duration: false, distance: false, notes: true } },
  { name: 'Romanian Deadlift', fields: { reps: true, weight: true, duration: false, distance: false, notes: true } },
  { name: 'Deadlift', fields: { reps: true, weight: true, duration: false, distance: false, notes: true } },
  { name: 'Walking Lunges', fields: { reps: true, weight: true, duration: false, distance: false, notes: true } },
  { name: '5K Run', fields: { reps: false, weight: false, duration: true, distance: true, notes: true } },
  { name: 'Row Intervals', fields: { reps: false, weight: false, duration: true, distance: true, notes: true } },
  { name: 'Cycling', fields: { reps: false, weight: false, duration: true, distance: true, notes: true } },
];

async function seed() {
  await client.connect();

  const passwordHash = await bcrypt.hash(password, 10);
  const token = uuidv4();

  await userCollection.updateOne(
    { email },
    {
      $set: {
        email,
        password: passwordHash,
        token,
      },
    },
    { upsert: true }
  );

  await workoutCollection.deleteMany({ userEmail: email });
  await workoutTemplateCollection.deleteMany({ userEmail: email });

  const templates = templateSeeds.map((template) => ({
    id: uuidv4(),
    userEmail: email,
    name: template.name,
    normalizedName: template.name.toLowerCase(),
    fields: template.fields,
  }));

  await workoutTemplateCollection.insertMany(templates);

  const templateMap = new Map(templates.map((template) => [template.name, template]));
  const workouts = buildYearOfWorkouts(templateMap);

  await workoutCollection.insertMany(workouts);

  console.log(`Seeded ${email}`);
  console.log(`Templates: ${templates.length}`);
  console.log(`Workouts: ${workouts.length}`);
  console.log(`Login password: ${password}`);

  await client.close();
}

function buildYearOfWorkouts(templateMap) {
  const workouts = [];
  const startDate = new Date('2025-03-31T00:00:00');
  const endDate = new Date('2026-03-29T00:00:00');
  let trainingDayCount = 0;

  for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
    const dayOfWeek = date.getDay();
    const weekIndex = getWeekIndex(startDate, date);
    const isRecoveryWeek = weekIndex % 4 === 3;
    const shouldTrainTuesday = weekIndex % 3 !== 2;

    const dayPlan = getDayPlan(dayOfWeek, shouldTrainTuesday);
    if (!dayPlan) {
      continue;
    }

    trainingDayCount += 1;
    const isoDate = formatDate(date);

    dayPlan.forEach((sessionName, sessionIndex) => {
      const template = templateMap.get(sessionName);
      const workout = buildWorkoutForTemplate({
        template,
        isoDate,
        weekIndex,
        trainingDayCount,
        isRecoveryWeek,
        sessionIndex,
        dayOfWeek,
      });

      workouts.push(workout);
    });
  }

  return workouts;
}

function getDayPlan(dayOfWeek, shouldTrainTuesday) {
  if (dayOfWeek === 1) {
    return ['Bench Press', 'Incline Dumbbell Press', 'Weighted Pull-Up', 'Row Intervals', 'Cycling'];
  }

  if (dayOfWeek === 2 && shouldTrainTuesday) {
    return ['Back Squat', 'Romanian Deadlift', 'Walking Lunges', 'Cycling'];
  }

  if (dayOfWeek === 4) {
    return ['Bench Press', 'Weighted Pull-Up', 'Incline Dumbbell Press', '5K Run', 'Row Intervals'];
  }

  if (dayOfWeek === 6) {
    return ['Back Squat', 'Deadlift', 'Walking Lunges', '5K Run', 'Cycling'];
  }

  return null;
}

function buildWorkoutForTemplate({ template, isoDate, weekIndex, trainingDayCount, isRecoveryWeek, sessionIndex, dayOfWeek }) {
  const phase = Math.min(weekIndex, 51);
  const deloadFactor = isRecoveryWeek ? 0.93 : 1;
  const workoutId = uuidv4();

  let notes = '';
  let sets = [];

  switch (template.name) {
    case 'Bench Press':
      if (dayOfWeek === 1) {
        const topWeight = roundToFive((155 + phase * 0.75) * deloadFactor);
        notes = isRecoveryWeek ? 'Deload upper day. Smooth tempo and pauses.' : 'Heavy bench focus with controlled lockout.';
        sets = [
          { reps: '10', weight: `${topWeight - 35}` },
          { reps: '8', weight: `${topWeight - 20}` },
          { reps: '6', weight: `${topWeight}` },
          { reps: '6', weight: `${topWeight}` },
        ];
      } else {
        const topWeight = roundToFive((135 + phase * 0.55) * deloadFactor);
        notes = isRecoveryWeek ? 'Volume kept lighter this week.' : 'Volume bench day. Focusing on bar speed.';
        sets = [
          { reps: '12', weight: `${topWeight - 20}` },
          { reps: '10', weight: `${topWeight - 10}` },
          { reps: '8', weight: `${topWeight}` },
          { reps: '8', weight: `${topWeight}` },
        ];
      }
      break;

    case 'Incline Dumbbell Press': {
      const workingWeight = roundToFive((45 + phase * 0.35) * deloadFactor);
      notes = 'Steady upper chest accessory work.';
      sets = [
        { reps: '12', weight: `${workingWeight - 10}` },
        { reps: '10', weight: `${workingWeight - 5}` },
        { reps: '8', weight: `${workingWeight}` },
        { reps: '8', weight: `${workingWeight}` },
      ];
      break;
    }

    case 'Weighted Pull-Up': {
      const addedWeight = Math.max(0, roundToNearest((10 + phase * 0.4) * deloadFactor, 2.5));
      notes = isRecoveryWeek ? 'Keeping pull-up volume crisp.' : 'Pull-ups are climbing slowly every month.';
      sets = [
        { reps: '8', weight: `${Math.max(0, addedWeight - 5)}` },
        { reps: '6', weight: `${addedWeight}` },
        { reps: '6', weight: `${addedWeight}` },
        { reps: '5', weight: `${addedWeight + 5}` },
      ];
      break;
    }

    case 'Back Squat': {
      const topWeight = roundToFive((205 + phase * 1.15) * deloadFactor);
      notes = isRecoveryWeek ? 'Reduced load to keep the pattern fresh.' : 'Squat depth and bracing are trending upward.';
      sets = [
        { reps: '8', weight: `${topWeight - 40}` },
        { reps: '6', weight: `${topWeight - 20}` },
        { reps: '5', weight: `${topWeight}` },
        { reps: '5', weight: `${topWeight}` },
      ];
      break;
    }

    case 'Romanian Deadlift': {
      const workingWeight = roundToFive((165 + phase * 0.8) * deloadFactor);
      notes = 'Hamstring accessory work with a slow eccentric.';
      sets = [
        { reps: '10', weight: `${workingWeight - 20}` },
        { reps: '8', weight: `${workingWeight}` },
        { reps: '8', weight: `${workingWeight}` },
        { reps: '8', weight: `${workingWeight}` },
      ];
      break;
    }

    case 'Deadlift': {
      const topWeight = roundToFive((255 + phase * 1.35) * deloadFactor);
      notes = isRecoveryWeek ? 'Cut one top set to stay fresh.' : 'Deadlift is moving better off the floor than it did in spring.';
      sets = [
        { reps: '5', weight: `${topWeight - 50}` },
        { reps: '4', weight: `${topWeight - 25}` },
        { reps: '3', weight: `${topWeight}` },
        { reps: '3', weight: `${topWeight}` },
      ];
      break;
    }

    case 'Walking Lunges': {
      const workingWeight = roundToFive((40 + phase * 0.45) * deloadFactor);
      notes = 'Single-leg work for balance and work capacity.';
      sets = [
        { reps: '12', weight: `${workingWeight}` },
        { reps: '12', weight: `${workingWeight}` },
        { reps: '10', weight: `${workingWeight + 5}` },
      ];
      break;
    }

    case '5K Run': {
      const distance = 3.1;
      const totalSeconds = Math.round((31 * 60 - phase * 4.2) / deloadFactor);
      notes = isRecoveryWeek ? 'Keeping the pace conversational this week.' : 'Run pace is slowly coming down while staying controlled.';
      sets = [
        { duration: formatDuration(totalSeconds), distance: distance.toFixed(1) },
      ];
      break;
    }

    case 'Row Intervals': {
      const intervalCount = 6;
      const baseSeconds = Math.max(100, Math.round((115 - phase * 0.22) / deloadFactor));
      notes = 'Consistent interval work with one minute rest between pieces.';
      sets = Array.from({ length: intervalCount }, (_, index) => ({
        duration: formatDuration(baseSeconds + (index % 2 === 0 ? 0 : 1)),
        distance: '0.3',
      }));
      break;
    }

    case 'Cycling': {
      const rideDistance = Math.min(22, 12 + phase * 0.16 + (trainingDayCount % 3));
      const rideMinutes = Math.round(52 - phase * 0.12 + (isRecoveryWeek ? 4 : 0));
      notes = 'Zone 2 ride to build aerobic base without beating up the legs.';
      sets = [
        { duration: `${rideMinutes}:00`, distance: rideDistance.toFixed(1) },
      ];
      break;
    }

    default:
      break;
  }

  return {
    id: workoutId,
    userEmail: email,
    date: isoDate,
    templateId: template.id,
    templateName: template.name,
    exercise: template.name,
    fields: template.fields,
    notes,
    sets: sets.map((set, index) => sanitizeSet(set, template.fields, index)),
  };
}

function sanitizeSet(set, fields, index) {
  return {
    id: index + 1,
    ...(fields.reps ? { reps: `${set.reps ?? ''}` } : {}),
    ...(fields.weight ? { weight: `${set.weight ?? ''}` } : {}),
    ...(fields.duration ? { duration: `${set.duration ?? ''}` } : {}),
    ...(fields.distance ? { distance: `${set.distance ?? ''}` } : {}),
  };
}

function roundToFive(value) {
  return Math.round(value / 5) * 5;
}

function roundToNearest(value, increment) {
  return Math.round(value / increment) * increment;
}

function getWeekIndex(startDate, currentDate) {
  const millisecondsPerWeek = 1000 * 60 * 60 * 24 * 7;
  return Math.floor((currentDate - startDate) / millisecondsPerWeek);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

seed().catch(async (error) => {
  console.error('Failed to seed dummy data:', error);
  await client.close();
  process.exit(1);
});
