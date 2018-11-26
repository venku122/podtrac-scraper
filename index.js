require('dotenv').config();
const fs = require('fs');
const puppeteer = require('puppeteer');
const schedule = require('node-schedule');
const express = require('express')
const {
  Episode,
  saveDownloadForEpisode,
  getEpisodeCount,
  getDownloadDataCount,
} = require('./db');
const url = 'https://publisher.podtrac.com/account/login'
const email = process.env.PODTRAC_EMAIL; 
const password = process.env.PODTRAC_PASSWORD;

const saveDataToFile = (jsonData) => {
  const dateString = new Date().toString().replace(/[\s\(\)\-\:]/g, '_');
  fs.writeFile(`${__dirname}/podtrac_data_${dateString}.json`, JSON.stringify(jsonData), (err) => {
    if (err) {
      return console.log(`error occured saving to file: ${err}`);
    }
    console.log(`Parsed data written to file: podtrac_data_${dateString}.json`);
  });
}

const saveEpisodeDataToMongoDB = (episodeData) => {
  for (let i = 0; i < episodeData.length; i++) {
    const episodeInstance = new Episode(episodeData[i]);
    episodeInstance.save((err, instance) => {
      if (err) {
        console.error(err);
      }
      console.log(`episode ${i} saved to mongodb: ${instance.name}`);
    });
  }
}

const saveEpisodeDataToPostgresDB = async (episodeData) => {
  for (let i = 0; i < episodeData.length; i++) {
    const downloadRecord = episodeData[i];
    const episodeName = downloadRecord.name;
    for (let j = 0; j < downloadRecord.data.length; j++) {
      const downloadDailyInfo = downloadRecord.data[j];
      const date = downloadDailyInfo.dateString;
      const downloads = downloadDailyInfo.downloads;
      saveDownloadForEpisode(episodeName, date, downloads);
    }
  }
}

parseDailyHeaders = () => {
  const groupRow = Array.from(document.querySelectorAll('.group-row'))[0];
  const daysInRange = [];
  const year = new Date().getFullYear();
  for (let i = 0; i < groupRow.children.length; i++) {
    const child = groupRow.children[i];
    if (child.className === 'group-label') continue;
    if (child.innerText === 'All Time\t') continue;
    let dayIdentifier = child.innerText.replace('\t', '');
    dayIdentifier = `${dayIdentifier}/${year}`;
    daysInRange.push(dayIdentifier);
  }
  return daysInRange;
};

parseDailyDataTable = (tableHeadersRef) => {
  const rows = Array.from(document.querySelectorAll('.data-row'));
  const parsedRows = [];
  rows.map(row => {
    const parsedRow = {
      name: 'undefined',
      data: [],
    };
    const days = tableHeadersRef.slice(); // makes a copy of week ranges to consume
    let periodTotal = 0;
    for (let i = 0; i < row.children.length; i++) {
      const child = row.children[i];
      if (child.tagName === 'TH') {
        let episodeName = child.innerText.replace('\t', '').replace('\n', '');
        parsedRow.name = episodeName;
      }
      if (child.tagName === 'TD') {
        if (child.className === 'total-cell') {
          let total = child.innerText.replace('\t', '').replace('\n', '').replace(/,/g, '');
          let numericValue = 0;
          if (total !== '-') {
            numericValue = Number.parseInt(total, 10);
          }
          parsedRow.allTimeRecorded = numericValue;
        } else {
          let weeklyDownloads = child.innerText.replace('\t', '').replace('\n', '').replace(/,/g, '');
          let numericValue = 0;
          if (weeklyDownloads !== '-') {
            numericValue = Number.parseInt(weeklyDownloads, 10);
          }
          periodTotal += numericValue;
          const inputDate = days.shift();
          const postgresDate = inputDate.replace(/(\d\d)\/(\d\d)\/(\d{4})/, "$3-$1-$2");
          const downloadObj = {
            dateString: postgresDate,
            downloads: numericValue,
          };
          parsedRow.data.push(downloadObj);
        }
      }
    }
    // parsedRow.periodTotal = periodTotal;
    parsedRows.push(parsedRow);
  });
  return parsedRows;
};

const parseDailyCount = async (page, url) => {

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    await page.goto(url),
  ]);
  console.log('Clicking on daily episode table');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.$$eval('.report-period a', links => links[0].click()),
  ]);
  console.log(`New Page URL: ${page.url()}`);

  const dailyTableHeaders = await page.evaluate(parseDailyHeaders);
  const dailyTableData = await page.evaluate(parseDailyDataTable, dailyTableHeaders);


  console.log('day info:');
  console.dir(dailyTableHeaders);
  console.dir(dailyTableData);

  saveEpisodeDataToPostgresDB(dailyTableData);
};

const parseWeeklyHeaders = () => {
  const groupRow = Array.from(document.querySelectorAll('.group-row'))[0];
  const weeksInRange = [];
  const year = new Date().getFullYear();
  for (let i = 0; i < groupRow.children.length; i++) {
    const child = groupRow.children[i];
    if (child.className === 'group-label') continue;
    if (child.innerText === 'All Time\t') continue;
    let weekIdentifier = child.innerText.replace('\t', '');
    weekIdentifier = `${weekIdentifier}/${year}`;
    weeksInRange.push(weekIdentifier);
  }
  return weeksInRange;
};

const parseWeeklyDataTable = (tableHeadersRef) => {
  const rows = Array.from(document.querySelectorAll('.data-row'));
  const parsedRows = [];
  rows.map(row => {
    const parsedRow = {
      name: 'undefined',
      data: [],
    };
    const weeks = tableHeadersRef.slice(); // makes a copy of week ranges to consume
    let periodTotal = 0;
    for (let i = 0; i < row.children.length; i++) {
      const child = row.children[i];
      if (child.tagName === 'TH') {
        let episodeName = child.innerText.replace('\t', '').replace('\n', '');
        parsedRow.name = episodeName;
      }
      if (child.tagName === 'TD') {
        if (child.className === 'total-cell') {
          let total = child.innerText.replace('\t', '').replace('\n', '').replace(/,/g, '');
          let numericValue = 0;
          if (total !== '-') {
            numericValue = Number.parseInt(total, 10);
          }
          parsedRow.allTimeRecorded = numericValue;
        } else {
          let weeklyDownloads = child.innerText.replace('\t', '').replace('\n', '').replace(/,/g, '');
          let numericValue = 0;
          if (weeklyDownloads !== '-') {
            numericValue = Number.parseInt(weeklyDownloads, 10);
          }
          periodTotal += numericValue;
          const dateString = weeks.shift();
          const downloadObj = {
            dateString,
            downloads: numericValue,
            date: new Date(dateString),
          };
          parsedRow.data.push(downloadObj);
        }
      }
    }
    // parsedRow.periodTotal = periodTotal;
    parsedRows.push(parsedRow);
  });
  return parsedRows;
};

const loginToPodtrac = async () => {
  console.log(`Starting scrape of Podtrac at ${new Date().toString()}`);
  const browser = await puppeteer.launch({headless: true});
  const page = await browser.newPage();

  console.log('Puppeteer browser is live');
  await page.goto(url);
  console.log('Puppeteer loaded login page');

  await page.type('#Email', email);
  await page.type('#ClearPasscode', password);
  console.log('Login form button clicked');

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    await page.click('.button'),
  ]);
  console.log(`New Page URL: ${page.url()}`);

  console.log('Clicking on episode playcount');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.$$eval('.stats-cell a', links => links[1].click()),
  ]);

  console.log(`New Page URL: ${page.url()}`);
  const statisticsPageURL = page.url();
  const page2 = await browser.newPage(); // scrape the episodes page
  parseDailyCount(page2, statisticsPageURL);

  const weeklyTableHeaders = await page.evaluate(parseWeeklyHeaders);
  const weeklyTableData = await page.evaluate(parseWeeklyDataTable, weeklyTableHeaders);

  console.dir(weeklyTableHeaders);
  console.dir(weeklyTableData);
}

const scrapePodtracNightly = schedule.scheduleJob('5 2 * * *', loginToPodtrac); // scrape new data at 2:05am
const scrapePodtracDaily = schedule.scheduleJob('5 17 * * *', loginToPodtrac); // scrape new data at 5:05pm

const app = express()
const port = process.env.PORT ? process.env.PORT : 3000;

app.get('/triggerScrape', (req, res) => {
  loginToPodtrac();
  console.log('PodTrac scrape initiated off-schedule');
  res.status(200).send({
    message: 'PodTrac scrape initiated off-schedule'
  });
});

app.get('/episodeCount', async (req, res) => {
  const episodeCount = await getEpisodeCount();
  res.status(200).send({
    episodeRecords: episodeCount,
  });
});


app.get('/downloadDataCount', async (req, res) => {
  const downloadCount = await getDownloadDataCount();
  res.status(200).send({
    downloadRecords: downloadCount,
  });
});

app.get('/nextScheduledScrape', (req, res) => {
  res.status(200).send({
    scheduledScrapes: [
      scrapePodtracDaily.nextInvocation(),
      scrapePodtracNightly.nextInvocation(),
    ],
  });
});

app.listen(port, () => console.log(`Podtrac Scraper listening on port ${port}!`));

console.log(`Scrapings scheduled for ${scrapePodtracNightly.nextInvocation()} and ${scrapePodtracDaily.nextInvocation()}`);