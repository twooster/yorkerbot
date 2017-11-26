const path = require("path");
const { createCanvas, Image, registerFont } = require("canvas");

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
  let lineWidth = 0;
  let totalTextWidth = 0;
  let linesNeeded = 1;

  for (const word of words) {
    const wordWidth = word.width;
    let addWidth;

    if (lineWidth !== 0) {
      if (lineWidth + spaceWidth + wordWidth <= maxTextWidth) {
        addWidth = wordWidth + spaceWidth;
      } else {
        linesNeeded += 1;
        lineWidth = 0;
        addWidth = wordWidth;
      }
    } else {
      addWidth = wordWidth;
    }

    lineWidth += addWidth;
    totalTextWidth += addWidth;
  }

  return [linesNeeded, totalTextWidth / linesNeeded];
}

function createBalancedLines(words, spaceWidth, linesNeeded, avgLineWidth, maxTextWidth) {
  let lines = [];
  let totalTextWidth = 0;

  let lineWords       = [];
  let lineWidth       = 0;
  let cumAvgLineWidth = avgLineWidth;
  let lastLine        = linesNeeded === 1;

  for (const word of words) {
    const wordWidth = word.width;
    let addWidth;

    if (lineWidth !== 0) {
      const wordAndSpaceWidth = wordWidth + spaceWidth;
      if (lineWidth + wordAndSpaceWidth > maxTextWidth ||
          (!lastLine && totalTextWidth + wordAndSpaceWidth > cumAvgLineWidth)) {
        // Clear current line:
        lines.push(lineWords.join(" "));
        lineWords = [];
        lineWidth = 0;
        lastLine = lines.length === linesNeeded;
        cumAvgLineWidth += avgLineWidth;

        addWidth = wordWidth;
      } else {
        addWidth = wordAndSpaceWidth;
      }
    } else {
      addWidth = wordWidth;
    }
    lineWidth += addWidth;
    totalTextWidth += addWidth;
    lineWords.push(word.text);
  }
  if (lineWords.length) {
    lines.push(lineWords.join(" "));
  }

  return lines;
}

const CAPTION_DEFAULT_OPTS = {
  captionMarginSides: 40,
  captionMarginTop:   25,
  fontSize:           "18pt",
  fontColor:          "#111111",
  lineSpacing:        2,
  outerPadding:       20,
  resizeComicWidth:   600,
};

function _caption(image, caption, opts = {}) {
  opts = Object.assign({}, CAPTION_DEFAULT_OPTS, opts);
  const fontSize           = opts.fontSize;
  const fontColor          = opts.fontColor;
  const outerPadding       = opts.outerPadding;
  const captionMarginTop   = opts.captionMarginTop;
  const captionMarginSides = opts.captionMarginSides;
  const comicWidth         = opts.resizeComicWidth;
  const lineSpacing        = opts.lineSpacing;

  const imageWidth = image.width;
  const imageHeight = image.height;

  const scaleFactor = comicWidth / imageWidth;
  const comicHeight = (scaleFactor * imageHeight)|0;

  const finalImageWidth = comicWidth + (2 * outerPadding);
  let finalImageHeight = comicHeight + (2 * outerPadding);

  // we'll resize the canvas later
  const canvas = createCanvas(finalImageWidth, finalImageHeight);
  const ctx = canvas.getContext('2d');

  ctx.textBaseline = 'top';
  ctx.font = `normal italic ${fontSize} "Adobe Caslon Pro"`;
  ctx.antialias = "subpixel";

  const maxTextWidth = imageWidth - (captionMarginSides * 2);

  const spaceWidth = ctx.measureText(" ").width;

  const words = caption
    .split(/\s+/) // collapse multiple spaces
    .map((word) => {
      return {
        text: word,
        width: ctx.measureText(word).width
      };
    });

  const [linesNeeded, avgLineWidth] = calcAvgLineWidth(words, spaceWidth, maxTextWidth);

  let totalLineHeight = 0;
  const lines = createBalancedLines(words, spaceWidth, linesNeeded, avgLineWidth, maxTextWidth)
    .map((text) => {
      const measure = ctx.measureText(text);
      const height = measure.emHeightAscent + measure.emHeightDescent;
      totalLineHeight += height;
      return { text, width: measure.width, height };
    });

  const captionHeight = Math.ceil(
    totalLineHeight +
    (lines.length - 1) * lineSpacing +
    captionMarginTop
  );

  finalImageHeight += captionHeight;
  canvas.height = finalImageHeight;

  // Fill white
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, finalImageWidth, finalImageHeight);


  // Draw image
  ctx.drawImage(image, outerPadding, outerPadding, comicWidth, comicHeight);

  // Draw text
  ctx.fillStyle = fontColor;
  textY = outerPadding + comicHeight + captionMarginTop;
  for (const line of lines) {
    const textX = ((finalImageWidth - line.width) / 2);
    ctx.fillText(line.text, textX, textY);
    textY += line.height + lineSpacing;
  }

  return canvas;
}

function imageFromTypeAndData({ type, data }) {
  const img = new Image();
  img.src = data;
  return img;
}

function imageToPngBuffer(image) {
  const stream = image.pngStream();
  const promise = new Promise((resolve, reject) => {
    const bufs = [];
    stream.on('data', (data) => bufs.push(data));
    stream.on('error', (err) => reject(err))
    stream.on('end', () => resolve(Buffer.concat(bufs)));
  });
  return promise;
}

const registerFonts = (function() {
  const CASLON_ITALIC = path.join(__dirname, 'adobe-caslon-pro-italic.ttf');

  let hasRegistered = false;
  return function() {
    if (!hasRegistered) {
      // we fake having a non-italic version
      //var font = new Font("Adobe Caslon Pro", CASLON_ITALIC);
      //font.addFace(CASLON_ITALIC, 'normal', 'italic');
      //globalFonts.push(font);
      registerFont(CASLON_ITALIC, {family: "Adobe Caslon Pro", style: "italic"});
      hasRegistered = true;
    }
  }
})();

function caption(imageData, caption, opts = {}) {
  registerFonts();

  const origImg = imageFromTypeAndData(imageData);
  const captionedImg = _caption(origImg, caption, opts);
  return imageToPngBuffer(captionedImg);
}

module.exports = { caption };
