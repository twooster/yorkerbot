require('dotenv').config();

const path  = require('path');
const gd    = require('node-gd');
const Twit  = require('twit');
const axios = require('axios');
const btoa  = require('btoa');

const twitClient = new Twit({
  consumer_key:        process.env.TWITTER_CONSUMER_KEY,
  consumer_secret:     process.env.TWITTER_CONSUMER_SECRET,
  access_token:        process.env.TWITTER_ACCESS_TOKEN,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
});

const NEW_YORKER_ENDPOINT = "https://www.newyorker.com/cartoons/random/randomAPI1";
const LEFT_QUOTE = "\u201C";
const RIGHT_QUOTE = "\u201D";

const WH_LAT = 38.8977; // n
const WH_LONG = -77.0365; // w

const CASLON_TTF = path.join(__dirname, 'adobe-caslon-pro-italic.ttf');

function log(msg) {
  const date = new Date();
  console.log.apply(console, [`[${date.toISOString()}]`].concat(Array.prototype.slice.call(arguments)));
}

class TryAgain extends Error { };

function fetchRandomComicImage() {
  const quotableComicTest = /^\s*&ldquo;.*&rdquo;\s*$/;

  log("Fetching New Yorker comic");

  return axios
    .get(NEW_YORKER_ENDPOINT)
    .then((response) => {
      const comics = response.data;
      if (comics instanceof Array && comics.length > 0) {
        log(`Fetched ${comics.length} comic(s)`);
        for (const comic of comics) {
          const caption = comic.caption;
          if (caption && caption.match(quotableComicTest)) {
            return comic;
          }
          log("Skipping comic with non-matching caption");
        }
      }
      throw new TryAgain("No valid comics in this request");
    }, (err) => {
      throw new TryAgain("Unable to fetch comic metadata: ${err}");
    })
    .then((comic) => {
      log(`Fetching ${comic.src}`);
      return axios
        .get(comic.src, { responseType: "arraybuffer" })
        .then((response) => {
          const contentType = response.headers['content-type'];
          const data = response.data;

          switch (contentType) {
            case 'image/jpeg':
              return gd.createFromJpegPtr(data);
            case 'image/png':
              return gd.createFromPngPtr(data);
            case 'image/gif':
              return gd.createFromGifPtr(data);
            default:
              throw new TryAgain("Bad image type");
          }
        }, (err) => {
          throw new TryAgain("Unable to fetch image");
        });
    })
    .catch((err) => {
      if (err instanceof TryAgain) {
        log("Will retry:", err.message);
        return fetchRandomComicImage();
      }
      throw err;
    });
}

function createBalancedLines(words, spaceWidth, linesNeeded, avgLineWidth, maxTextWidth) {
  let lines = [];

  let lineWords = [];
  let curLineWidth = 0;
  let cumTextWidth = 0;
  let cumAvgLineWidth = avgLineWidth;
  let lastLine = linesNeeded == 1;

  for (const word of words) {
    const wordWidth = word.width;
    let addWidth;

    if (curLineWidth !== 0) {
      const wordWithSpaceWidth = wordWidth + spaceWidth;
      if (curLineWidth + wordWithSpaceWidth > maxTextWidth ||
          (!lastLine && cumTextWidth + wordWithSpaceWidth > cumAvgLineWidth)) {
        // Clear current line:
        lines.push(lineWords.join(" "));
        lineWords = [];
        curLineWidth = 0;
        lastLine = lines.length === linesNeeded;
        cumAvgLineWidth += avgLineWidth;

        addWidth = wordWidth;
      } else {
        addWidth = wordWithSpaceWidth;
      }
    } else {
      addWidth = wordWidth;
    }
    curLineWidth += addWidth;
    cumTextWidth += addWidth;
    lineWords.push(word.text);
  }
  if (lineWords.length) {
    lines.push(lineWords.join(" "));
  }

  return lines;
}

// Algorithm for creating center-balanced lines from
// <http://webplatform.adobe.com/balance-text/proposal/index.html>
/*
 * 1. Divide the total text width by the required number of lines to
 * determine the average line width.
 *
 * 2. Keep track of total width and number of lines and attempt to break at
 * "cumulative average line width" (average line length multiplied by the
 * current line number). This self-adjusts the amount of text on each line
 * (e.g. for a line shorter than average, the next line will tend to be
 * longer than average).
 *
 * 3. Use center-point (not end) of word to determine where to break for
 * better balance.
 *
 * 4. Don't allow line length to exceed container line length.
 *
 * 5. Ignore "cumulative average line width" for last line.
 */

function calcAvgLineWidth(words, spaceWidth, maxTextWidth) {
  let curLineWidth = 0;
  let cumTextWidth = 0;
  let linesNeeded = 1;

  for (const word of words) {
    const wordWidth = word.width;
    let addWidth;

    if (curLineWidth !== 0) {
      if (curLineWidth + spaceWidth + wordWidth <= maxTextWidth) {
        addWidth = wordWidth + spaceWidth;
      } else {
        linesNeeded += 1;
        curLineWidth = 0;
        addWidth = wordWidth;
      }
    } else {
      addWidth = wordWidth;
    }

    curLineWidth += addWidth;
    cumTextWidth += addWidth;
  }

  return [linesNeeded, cumTextWidth / linesNeeded];
}

function captionImage(image, caption) {
  const fontSize = 14;
  const fontPath = CASLON_TTF;
  const lineSpacing = 2; // (fontSize * 0.25)|0;
  const minLineHeight = (fontSize * 1.4)|0;

  const imageWidth = image.width;
  const imageHeight = image.height;

  const outerPadding = 20;
  const comicWidth = 600;

  const scaleFactor = comicWidth / imageWidth;
  const comicHeight = (scaleFactor * imageHeight)|0;

  const finalImageWidth = comicWidth + (2 * outerPadding);
  let finalImageHeight = comicHeight + (2 * outerPadding);

  const captionMarginVert = outerPadding + 4;
  const captionMarginHoriz = 50;

  const maxTextWidth = imageWidth - (captionMarginHoriz * 2);

  const textColor = image.colorAllocate(0, 0, 0);
  function calcTextWidthHeight(image, text) {
    // gd.Image#stringFTBBox(color, font, size, angle, x, y, string)
    const bbox = image.stringFTBBox(textColor, fontPath, fontSize, 0, 0, 0, text);
    //    0    1    2,   3    4    5    6    7
    // [xll, yll, xlr, ylr, xur, yur, xul, yul]
    return [bbox[2] - bbox[0], bbox[3] - bbox[5]];
  }

  const spaceWidth = calcTextWidthHeight(image, " ")[0];

  const words = caption
    .split(/\s+/) // collapse multiple spaces
    .map((word) => {
      return {
        text: word,
        width: calcTextWidthHeight(image, word)[0]
      };
    });


  const [linesNeeded, avgLineWidth] = calcAvgLineWidth(words, spaceWidth, maxTextWidth);

  let totalLineHeight = 0;
  const lines = createBalancedLines(words, spaceWidth, linesNeeded, avgLineWidth, maxTextWidth)
    .map((text) => {
      const [width, height] = calcTextWidthHeight(image, text);
      const lineHeight = Math.max(height, minLineHeight)
      totalLineHeight += lineHeight;
      return { text, width, height: lineHeight };
    });

  const captionHeight = (
    totalLineHeight +
    (lines.length - 1) * lineSpacing +
    captionMarginVert
  )|0;

  finalImageHeight += captionHeight;

  const finalImage = gd.createTrueColorSync(finalImageWidth, finalImageHeight);

  finalImage.fill(0, 0, 0xffffff); // fill white
  if (Math.abs(scaleFactor - 1.0) < 0.0001) {
    // gd.Image#copyResampled(dest, dx, dy, sx, sy, dw, dh, sw, sh)
    image.copy(finalImage, outerPadding, outerPadding, 0, 0, imageWidth, imageHeight);
  } else {
    // gd.Image#copy(dest, dx, dy, sx, sy, width, height)
    image.copyResampled(finalImage, outerPadding, outerPadding, 0, 0, comicWidth, comicHeight, imageWidth, imageHeight);
  }

  const finalTextColor = gd.trueColor(8, 8, 8);
  textY = outerPadding + comicHeight + captionMarginVert;
  for (const line of lines) {
    const textX = ((finalImageWidth - line.width) / 2)|0;
    // gd.Image#stringFT(color, font, size, angle, x, y, string, boundingbox)
    finalImage.stringFT(finalTextColor, fontPath, fontSize, 0, textX|0, textY|0, line.text);
    textY += line.height + lineSpacing;
  }

  return finalImage;
}

function uploadImageToTwitter(image, altText) {
  return twitClient
    .post('media/upload', { media_data: btoa(image.pngPtr()) })
    .then((result) => {
      const mediaId = result.data.media_id_string;
      log("Image upload succeeded, mediaId:", mediaId);
      if (altText) {
        log("Attempting to create image metadata");
        const params = {
          media_id: mediaId,
          alt_text: {
            text: altText.substr(0, 420)
          }
        };
        return twitClient
          .post('media/metadata/create', params)
          .then((result) => {
            // Somehow this comes thru the non-error pipeline?
            if (result.error) {
              throw new Error("Error: " + result.error);
            }
            log("Image metadata creation successful");
            return mediaId;
          });
      }
      return mediaId;
    });
}

function tweetMediaInResponseTo(mediaId, origTweet) {
  const tweet = {
    status:                       `@${origTweet.user.screen_name}`,
    in_reply_to_status_id:        origTweet.id_str,
    auto_populate_reply_metadata: true,
    media_ids:                    [mediaId],
    lat:                          WH_LAT,
    long:                         WH_LONG,
  }
  return twitClient
    .post('statuses/update', tweet);
}

function handleTweet(tweet, followIds) {
  if (followIds.indexOf(tweet.user.id_str) === -1) {
    return;
  }
  if (tweet.is_quote_status) {
    return;
  }
  let tweetText = [LEFT_QUOTE, tweet.text.trim(), RIGHT_QUOTE].join("");
  fetchRandomComicImage()
    .then((image) => captionImage(image, tweetText))
    .then((image) => uploadImageToTwitter(image, tweetText))
    .then((mediaId) => tweetMediaInResponseTo(mediaId, tweet))
    .then((result) => {
      log("Successful tweet! ID:", result.data.id_str);
    }, (err) => {
      log("Error attempting to tweet!", err);
    });
}

function run(followIds = []) {
  log("TrumpYorkerBot coming online");

  const stream = twitClient.stream('statuses/filter', { follow: followIds })

  stream.on("connect", (request) => {
    log("Attempting to connect");
  });

  stream.on("connected", (response) => {
    log("Connected");
  });

  stream.on("reconnect", (request, response, connectInterval) => {
    log("Reconnecting");
  });

  stream.on("disconnect", (disconnectMessage) => {
    log("Disconnected:", disconnectMessage);
  });

  stream.on("user_event", (eventMsg) => {
    log("User event", eventMsg);
  });

  stream.on("tweet", (tweet) => handleTweet(tweet, followIds));
}

module.exports = { run };
