const mongoose = require('mongoose');
const { Pool } = require('pg');
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

const pool = new Pool ();

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err)
  // process.exit(-1)
});

// async/await - check out a client
(async () => {
  const client = await pool.connect();
  try {
    const episodes = await client.query('SELECT COUNT(*) FROM "Episodes"');
    console.log(`number of episodes in postgres: ${episodes.rows[0].count}`)
    const downloads = await client.query('SELECT COUNT(*) FROM "Downloads"');
    console.log(`number of data points: ${downloads.rows[0].count}`);
  } finally {
    client.release()
  }
})().catch(e => console.log(e.stack))

const getEpisodeFromName = async (episodeName) => {
  const client = await pool.connect();
  const cleanEpisodeName = episodeName.replace(/[\'\"]/g, '');
  try {
    const episodes = await client.query(`
    SELECT *
    FROM "Episodes"
    WHERE "name" = '${cleanEpisodeName}'`);
    return episodes.rows[0];
  } finally {
    client.release()
  }
}

const createEpisodeRecord = async (episodeName) => {
  const client = await pool.connect();
  try {
    const currentDate = Date.now();
    const cleanEpisodeName = episodeName.replace(/[\'\"]/g, '');
    const episode = await client.query(`
    INSERT INTO "Episodes"
    ("name", "downloadsReported", "dateUploaded", "dateUpdated")
    VALUES
    ('${cleanEpisodeName}', 0, to_timestamp(${currentDate} / 1000.0), to_timestamp(${currentDate} / 1000.0))
    RETURNING "id"
    `);
    return episode.rows[0];
  } finally {
    client.release()
  }
}

const getDownloadRecordByID = async (downloadID) => {
  const client = await pool.connect();
  try {
    const downloadRecord = await client.query(`
    SELECT "id"
    FROM "Downloads"
    WHERE
    "id" = '${downloadID}'
    `);
    return downloadRecord.rows[0];
  } finally {
    client.release()
  }
}

const generateDownloadID = (episodeId, date) => {
  const cleanDate = date.replace(/[\/]+/g, '_');
  return `${episodeId}_${cleanDate}`;
}

const saveDownloadForEpisode = async (episodeName, date, downloadCount) => {
  let episode = await getEpisodeFromName(episodeName);
  if (!episode) {
    episode = await createEpisodeRecord(episodeName);
  }
  const episodeID = episode.id;
  const downloadID = generateDownloadID(episode.id, date);
  const client = await pool.connect();
  try {
    const existingDownloadRecord = await getDownloadRecordByID(downloadID);
    let downloadRecord = null;
    if (!existingDownloadRecord) {
      downloadRecord = await client.query(`
      INSERT INTO "Downloads"
      ("id", "episodeID", "date", "downloads", "updated")
      VALUES
      ('${downloadID}', ${episodeID}, '${date}', ${downloadCount}, to_timestamp(${Date.now()} / 1000.0))
      `);
      return downloadRecord;
    } else {
      downloadRecord = await client.query(`
      UPDATE "Downloads"
      SET
      "downloads" = ${downloadCount},
      "updated" =  to_timestamp(${Date.now()} / 1000.0)
      WHERE "id" ='${downloadID}'
      `);
      return downloadRecord;
    }
  } finally {
    client.release()
  }
}

module.exports = {
  Episode,
  saveDownloadForEpisode,
};