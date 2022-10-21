const playwright = require("playwright-aws-lambda");
const AWS = require("aws-sdk");
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

exports.handler = async (event) => {
  let url = null;
  if (event["url"]) {
    url = event["url"];
  }

  const browser = await playwright.launchChromium();

  const context = await browser.newContext();

  const page = await context.newPage();

  if (url) {
    await page.goto(url);
    const screenshot = await page.screenshot();

    for (let i = 0; i < 50; i++) {
      await page.waitForTimeout(100);
      const path =
        url.replace(/\//g, "") +
        `/screenshot_${String(i + 1).padStart(5, "0")}.jpg`;
      await S3.putObject({
        Bucket: bucket,
        ContentType: "image/jpeg",
        Key: path,
        Body: screenshot,
      }).promise();
    }

    await browser.close();
    return { message: "Screenshot succeed" };
  } else {
    return { message: "Screenshot failed" };
  }
};
