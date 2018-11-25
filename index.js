require('dotenv').config();
const fs = require('fs');
const puppeteer = require('puppeteer');
const {
  Episode,
  saveDownloadForEpisode
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
      console.log(`saving download data for episode: ${episodeName} on ${date}: ${downloads}`);
      await saveDownloadForEpisode(episodeName, date, downloads);
    }
  }
}

const parseDailyCount = async (page, url) => {

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    await page.goto(url),
  ]);
  console.log('clicking on daily list');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.$$eval('.report-period a', links => links[0].click()),
  ]);
  console.log(`New Page URL: ${page.url()}`);

  const tableHeaders = await page.evaluate(() => {
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
  });

  const tableDataRows = await page.evaluate((tableHeadersRef) => {
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
              // date: postgresDate,
            };
            parsedRow.data.push(downloadObj);
          }
        }
      }
      // parsedRow.periodTotal = periodTotal;
      parsedRows.push(parsedRow);
    });
    return parsedRows;
  }, tableHeaders);


  console.log('day info:');
  console.dir(tableHeaders);
  console.dir(tableDataRows);

  // saveEpisodeDataToMongoDB(tableDataRows);
  saveEpisodeDataToPostgresDB(tableDataRows);
};



const loginToPodtrac = async () => {
  const browser = await puppeteer.launch({headless: false});
  const page = await browser.newPage();
  console.log('puppeteer browser is live');
  await page.goto(url);
  console.log('puppeteer loaded login page');
  await page.type('#Email', email);
  await page.type('#ClearPasscode', password);
  console.log('form button clicked');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    await page.click('.button'),
  ]);

  console.log(`New Page URL: ${page.url()}`);
  const dashboardURl = page.url();

  console.log('clicking on episode playcount');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.$$eval('.stats-cell a', links => links[1].click()),
  ]);
  console.log(`New Page URL: ${page.url()}`);
  const statisticsPageURL = page.url();
  const page2 = await browser.newPage();
  parseDailyCount(page2, statisticsPageURL);

 const tableHeaders = await page.evaluate(() => {
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
});


const tableDataRows = await page.evaluate((tableHeadersRef) => {
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
}, tableHeaders);

console.dir(tableHeaders);
console.dir(tableDataRows);

// saveDataToFile(tableDataRows);
}

loginToPodtrac();