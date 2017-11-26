const path = require("path");
const gd = require("node-gd");

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
  captionMarginSides: 50,
  captionMarginTop:   25,
  fontFile:           path.join(__dirname, 'adobe-caslon-pro-italic.ttf'),
  fontSize:           14,
  fontColor:          [8, 8, 8],
  lineSpacing:        2,
  outerPadding:       20,
  resizeComicWidth:   600,
};

function _caption(image, caption, opts = {}) {
  opts = Object.assign({}, CAPTION_DEFAULT_OPTS, opts);
  const fontSize           = opts.fontSize;
  const fontFile           = opts.fontFile;
  const fontColor          = opts.fontColor;
  const outerPadding       = opts.outerPadding;
  const captionMarginTop   = opts.captionMarginTop;
  const captionMarginSides = opts.captionMarginSides;
  const comicWidth         = opts.resizeComicWidth;
  const lineSpacing        = opts.lineSpacing;

  const minLineHeight = (fontSize * 1.4)|0;

  const imageWidth = image.width;
  const imageHeight = image.height;

  const scaleFactor = comicWidth / imageWidth;
  const comicHeight = (scaleFactor * imageHeight)|0;

  const finalImageWidth = comicWidth + (2 * outerPadding);
  let finalImageHeight = comicHeight + (2 * outerPadding);

  const maxTextWidth = imageWidth - (captionMarginSides * 2);

  const tmpTextColor = image.colorAllocate.apply(image, fontColor);
  const calcTextWidthHeight = (image, text, color = tmpTextColor) => {
    // gd.Image#stringFTBBox(color, font, size, angle, x, y, string)
    const bbox = image.stringFTBBox(color, fontFile, fontSize, 0, 0, 0, text);
    //    0    1    2,   3    4    5    6    7
    // [xll, yll, xlr, ylr, xur, yur, xul, yul]
    return [bbox[2] - bbox[0], bbox[3] - bbox[5]];
  };

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
    captionMarginTop
  )|0;

  finalImageHeight += captionHeight;

  const finalImage = gd.createTrueColorSync(finalImageWidth, finalImageHeight);

  finalImage.fill(0, 0, 0xffffff); // fill white
  if (Math.abs(scaleFactor - 1.0) < 0.0001) {
    // gd.Image#copyResampled(dest, dx, dy, sx, sy, dw, dh, sw, sh)
    image.copy(finalImage, outerPadding, outerPadding, 0, 0, imageWidth, imageHeight);
  } else {
    // gd.Image#copy(dest, dx, dy, sx, sy, width, height)
    image.copyResampled(finalImage, outerPadding, outerPadding,
                        0, 0, comicWidth, comicHeight, imageWidth, imageHeight);
  }

  const finalTextColor = gd.trueColor(8, 8, 8);
  textY = outerPadding + comicHeight + captionMarginTop;
  for (const line of lines) {
    const textX = ((finalImageWidth - line.width) / 2);
    // gd.Image#stringFT(color, font, size, angle, x, y, string, boundingbox)
    finalImage.stringFT(finalTextColor, fontFile, fontSize, 0, textX|0, textY|0, line.text);
    textY += line.height + lineSpacing;
  }

  return finalImage;
}

function imageCtxFromTypeAndData({ type, data }) {
  switch (type) {
    case 'image/jpeg':
      return gd.createFromJpegPtr(data);
    case 'image/png':
      return gd.createFromPngPtr(data);
    case 'image/gif':
      return gd.createFromGifPtr(data);
  }
  throw new Error("Cannot handle type:", type);
}

function imageCtxToData(imageCtx) {
  return imageCtx.pngPtr();
}

function caption(imageData, caption, opts = {}) {
  const origImgCtx = imageCtxFromTypeAndData(imageData);
  const captionedImage = _caption(origImgCtx, caption, opts);
  return imageCtxToData(captionedImage);
}

module.exports = { caption };
