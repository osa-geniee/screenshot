const { launchChromium } = require("playwright-aws-lambda");
const AWS = require("aws-sdk");
const http = require("http");
require("dotenv").config();

AWS.config.update({
  credentials: new AWS.Credentials(
    process.env.AWS_ACCESS_KEY,
    process.env.AWS_SECRET_KEY
  ),
  region: "ap-northeast-1",
});
const S3 = new AWS.S3();
const bucket = process.env.S3_BUCKET_NAME;
const num_images = 30;

const pageOptions = {
  extraHTTPHeaders: { "Accept-Language": "ja" },
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36",
  viewport: {
    width: 640,
    height: 360,
    deviceScaleFactor: 1,
  },
};

exports.handler = async (event) => {
  let html = null;
  let domain = null;

  if (event.body) {
    const body = JSON.parse(event.body);
    html = Buffer.from(body.html, "base64");
    domain = body.domain;
  }

  if (domain && html) {
    let browser = await launchChromium();
    let page = await browser.newPage(pageOptions);

    const server = await http.createServer((request, response) => {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.write(html);
      response.end();
    });

    let images = [];
    await server.listen("3000", "0.0.0.0");

    browser = await launchChromium();
    page = await browser.newPage(pageOptions);
    const client = await page.context().newCDPSession(page);
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: (15360 * 1000) / 8, // 15360kbps
      uploadThroughput: (15360 * 1000) / 8, // 15360kbps
      latency: 100,
    });
    page
      .goto("http://localhost:3000", { timeout: 0 })
      .then(() => {})
      .catch(() => {});

    for (let i = 0; i < num_images; i++) {
      await page.waitForTimeout(100);
      const screenshot = await page.screenshot();
      const path =
        domain.replace(/(http|https):\/\//g, "") +
        `/before/screenshot_${String(i + 1).padStart(5, "0")}.jpg`;
      await S3.putObject({
        Bucket: bucket,
        ContentType: "image/jpeg",
        Key: path,
        Body: screenshot,
      }).promise();

      images.push(
        S3.getSignedUrl("getObject", {
          Bucket: bucket,
          Key: path,
          Expires: 86400,
        })
      );
    }
    await browser.close();
    server.close();

    return {
      message: "Screenshot succeed",
      images: images,
    };
  } else {
    return { message: "Screenshot failed" };
  }
};
