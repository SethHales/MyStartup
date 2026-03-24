const { MongoClient } = require('mongodb');
const config = require('./dbConfig.json');

const url = `mongodb+srv://${encodeURIComponent(config.userName)}:${encodeURIComponent(config.password)}@${config.hostname}/?appName=Cluster0`;

const client = new MongoClient(url);
const db = client.db('quicksets');

// Collections
const userCollection = db.collection('user');
const workoutCollection = db.collection('workout');

// Connect on startup
async function connectToDatabase() {
  try {
    await db.command({ ping: 1 });
    console.log(`Connected to DB`);
  } catch (err) {
    console.error("DB connection failed:", err);
    process.exit(1);
  }
}

connectToDatabase();

module.exports = {
  userCollection,
  workoutCollection,
};