# podtrac-scraper
Scraper for Podtrac analytics


It polls at 5:05pm and 2:05am for new daily download information from Podtrac.

It has a REST API for monitoring the app.

## HTTP GET `/downloadDataCount`
This will give you a count of every download record stored in the database. One record contains the # of downloads on a given day for a given episode. So 5 days of data for one episode is 5 records.

## HTTP GET `/episodeCount`
This will give you a count of episode records stored in the database. This number does not match what Podtrac or the RSS feed says for number of episodes. That is because episode records are generated automatically when the scraper sees at least one download on at least one day in Podtrac. Someone downloaded most of our episodes this week, so it covers most episodes, but not all.

## HTTP GET `/nextScheduledScrape`
This will give you the timestamps for the next scheduled Podtrac scrape. It includes two values, one for the  afternoon run. and one for the nightly run.

## HTTP GET`/triggerScrape`
This will immediately trigger a scrape of Podtrac. This is for debugging/testing/etc and is currently the only way to recover if a scrape fails for some reason (Podtrac's site sucks a lot :/) The scheduled scrapes should be fine.

