const { MongoClient } = require('mongodb');
const config = require('./dbConfig.json');

const url = `mongodb://mongo:${encodeURIComponent(config.password)}@ac-gdg5on0-shard-00-00.i4hpk7l.mongodb.net:27017,ac-gdg5on0-shard-00-01.i4hpk7l.mongodb.net:27017,ac-gdg5on0-shard-00-02.i4hpk7l.mongodb.net:27017/?ssl=true&replicaSet=atlas-5f2msw-shard-0&authSource=admin&appName=Cluster0`;
const client = new MongoClient(url);
const sharedDb = client.db('quicksets');
const scripturesDb = client.db('scriptures');

const userCollection = sharedDb.collection('user');
const studySessionCollection = scripturesDb.collection('studySession');

async function connectToDatabase() {
  try {
    await sharedDb.command({ ping: 1 });
    await scripturesDb.command({ ping: 1 });
    console.log('Connected to DB');
  } catch (err) {
    console.error('DB connection failed:', err);
    process.exit(1);
  }
}

connectToDatabase();

module.exports = {
  userCollection,
  studySessionCollection,
};
