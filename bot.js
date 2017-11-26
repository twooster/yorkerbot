const path  = require("path");
const axios = require("axios");
const btoa  = require("btoa");

const { caption } = require("./captioner");

const NEW_YORKER_ENDPOINT = "https://www.newyorker.com/cartoons/random/randomAPI1";
const LEFT_QUOTE = "\u201C";
const RIGHT_QUOTE = "\u201D";

const QUOTABLE_COMIC_TEST = /^\s*&ldquo;.*&rdquo;\s*$/;

class TryAgain extends Error { };

class YorkerBot {
  constructor({ twit, followIds = [], location = {} }) {
    this.twit = twit;
    this.followIds = followIds;
    this.location = location;
  }

  listen() {
    this._log("YorkerBot, reporting for duty");

    if (this.followIds.length === 0) {
      this._log("Nobody to follow. Shutting this silly idea down.");
      return;
    }

    const stream = this.twit.stream('statuses/filter', { follow: this.followIds })

    stream.on("connect", (request) => {
      this._log("Attempting to connect");
    });

    stream.on("connected", (response) => {
      this._log("Connected");
    });

    stream.on("reconnect", (request, response, connectInterval) => {
      this._log("Reconnecting");
    });

    stream.on("disconnect", (disconnectMessage) => {
      this._log("Disconnected:", disconnectMessage);
    });

    stream.on("user_event", (eventMsg) => {
      this._log("User event", eventMsg);
    });

    stream.on("tweet", this.onTweet.bind(this));
  }

  _log(msg) {
    const date = new Date();
    console.log.apply(console,
      [`[${date.toISOString()}]`].concat(Array.prototype.slice.call(arguments)));
  }

  async tryFetchComic() {
    this._log("Fetching New Yorker comic");

    const comics = (await axios.get(NEW_YORKER_ENDPOINT)).data;
    if (!(comics instanceof Array || comics.length === 0)) {
      throw new TryAgain("No valid comics in this request");
    }

    const comic = comics.find((comic) =>
      comic.caption && comic.caption.match(QUOTABLE_COMIC_TEST))
    if (!comic) {
      throw new TryAgain("No quotable comics");
    }

    this._log(`Fetching ${comic.src}`);
    const comicImg = await axios.get(comic.src, { responseType: "arraybuffer" });
    return {
      type: comicImg.headers['content-type'],
      data: comicImg.data
    };
  }

  async fetchRandomComicImage() {
    const MAX_RETRIES = 10;
    for (let count = 0; count < MAX_RETRIES; ++retries) {
      try {
        return await this.tryFetchComic();
      } catch(e) {
        if (!(e instanceof TryAgain)) { throw e; }
        this._log("Caught error, retrying:", e.message);
      }
    }
  }

  async createImageAndMetadata(imageData, altText) {
    this._log("Uploading image to twitter")

    const uploadResp =  await this.twit.post(
      'media/upload', { media_data: btoa(imageData) });
    const mediaId = uploadResp.data.media_id_string;

    this._log("Image upload succeeded, mediaId:", mediaId);

    if (altText) {
      this._log("Attempting to create image metadata");

      const metadata = {
        media_id: mediaId,
        alt_text: {
          text: altText.substr(0, 420)
        }
      };

      const metadataResp = await this.twit.post(
        'media/metadata/create', metadata);
      if (metadataResp.error) {
        // Somehow this comes thru the non-error pipeline?
        throw new Error("Error: " + metadataResp.error);
      }
      this._log("Image metadata creation successful");
    }
    return mediaId;
  }

  tweetMediaInResponseTo(mediaId, origTweet) {
    const tweet = {
      status:                       `@${origTweet.user.screen_name}`,
      in_reply_to_status_id:        origTweet.id_str,
      auto_populate_reply_metadata: true,
      media_ids:                    [mediaId],
      lat:                          this.location.lat,
      long:                         this.location.long,
    }
    return this.twit.post('statuses/update', tweet);
  }

  onTweet(tweet) {
    if (this.followIds.indexOf(tweet.user.id_str) === -1) {
      return;
    }
    if (tweet.is_quote_status) {
      return;
    }
    return this.captionAndReplyTo(tweet);
  }

  async captionAndReplyTo(tweet) {
    let tweetText = tweet.text;
    if (tweet.extended_tweet) {
      tweetText = tweet.extended_tweet.full_text;
    }
    this._log("Processing tweet:", tweetText);

    // Remove trailing urls
    let splitTweet = tweetText.trim().split(/\s+/);
    while (splitTweet.length !== 0) {
      const word = splitTweet[splitTweet.length-1];
      if (word.match(/^https?:\/\//i)) {
        this._log("Removed trailing URL:", word);
        splitTweet.pop();
      } else {
        break;
      }
    }

    const quotedText = [LEFT_QUOTE, splitTweet.join(" "), RIGHT_QUOTE].join("");

    const imageData          = await this.fetchRandomComicImage();
    const captionedImageData = await caption(imageData, quotedText);
    const mediaId            = await this.createImageAndMetadata(captionedImageData, quotedText);
    const tweetResult        = await this.tweetMediaInResponseTo(mediaId, tweet);

    this._log("Successful tweet! ID:", tweetResult.data.id_str);
  }

  async captionAndReplyToTweetById(tweetId) {
    const tweet = (await this.twit.get('statuses/show/' + tweetId)).data;
    return this.captionAndReplyTo(tweet);
  }
}

module.exports = { YorkerBot };
