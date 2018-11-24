const mongoose = require('mongoose');

const mongoURL = process.env.MONGO_URL;

mongoose.connect(mongoURL);

const db = mongoose.connection;

db.on('error', console.error.bind(console, 'connection error: '));
db.once('open', () => {
  console.log('connected to mongodb');
});

const episodeSchema = new mongoose.Schema({
  name: String,
  allTimeRecorded: Number,
  data: [
    {
      dateString: String,
      downloads: Number,
      // date: Date,
    }
  ]
});

const Episode = mongoose.model('Episode', episodeSchema);

module.exports = {
  Episode
};