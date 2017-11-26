const Twit      = require('twit');
const YorkerBot = require('./bot');

const lat = 38.8977;
const long = -77.0365;
const followIds = ["25073877"]

const twit = new Twit({
  consumer_key:        process.env.TWITTER_CONSUMER_KEY,
  consumer_secret:     process.env.TWITTER_CONSUMER_SECRET,
  access_token:        process.env.TWITTER_ACCESS_TOKEN,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
});

const bot = new YorkerBot({
  twit,
  followIds,
  location: { lat, long }
});

bot.run();
