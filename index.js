require('dotenv').config();
const puppeteer = require('puppeteer');
const url = 'https://publisher.podtrac.com/account/login'
const email = process.env.PODTRAC_EMAIL; 
const password = process.env.PODTRAC_PASSWORD;

const loginToPodtrac = async () => {
  const browser = await puppeteer.launch({headless: false});
  const page = await browser.newPage();
  console.log('puppeteer browser is live');
  await page.goto(url);
  console.log('puppeteer loaded login page');
  await page.type('#Email', email);
  await page.type('#ClearPasscode', password);

  await page.click('.button');
  console.log('form button clicked');
  await page.waitForNavigation();
  console.log(`New Page URL: ${page.url()}`);
  const dashboardURl = page.url();

  console.log('clicking on episode playcount');
  await page.$$eval('.stats-cell a', links => links[1].click());
  console.log(`New Page URL: ${page.url()}`);

 const tableHeaders = await page.evaluate(() => {
  const ths = Array.from(document.querySelectorAll('.group-row th'))
  return ths.map(th => {
     const txt = th.innerText.replace('\t', '');
     // return txt.replace(/<a [^>]+>[^<]*<\/a>/g, '').trim();
     console.log(`table header text: ${txt}`);
     return txt;
  });
});

const tableData = await page.evaluate(() => {
  const tds = Array.from(document.querySelectorAll('.data-row td'))
  return tds.map(td => {
     const txt = td.innerText.replace('\t', '').replace('\n', '').replace(',', '');
     // return txt.replace(/<a [^>]+>[^<]*<\/a>/g, '').trim();
     let numericValue = 0;
     if (txt !== '-') {
       numericValue = Number.parseInt(txt, 10);
     }
     console.log(`table row data: ${numericValue}`);
     return numericValue;
  });
});

console.dir(tableHeaders);
console.dir(tableData);
}

loginToPodtrac();