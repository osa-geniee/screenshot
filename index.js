const playwright = require("playwright-aws-lambda");
const AWS = require("aws-sdk");
const http = require("http");
const url = require("url");
const cheerio = require("cheerio");
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
const num_images = Number(process.env.NUM_IMAGES);

const pageOptions = {
  extraHTTPHeaders: { "Accept-Language": "ja" },
  viewport: {
    width: 640,
    height: 360,
    deviceScaleFactor: 1,
  },
};
async function screenshot(target_html, dir, num) {
  const server = await http.createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.write(target_html);
    response.end();
  });

  await server.listen("3000", "0.0.0.0");

  const browser = await playwright.launchChromium({
    headless: false,
  });
  const page = await browser.newPage(pageOptions);
  const client = await page.context().newCDPSession(page);
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    downloadThroughput: (15360 * 1000) / 8, // 15360kbps
    uploadThroughput: (15360 * 1000) / 8, // 15360kbps
    latency: 100,
  });

  page.goto("http://localhost:3000", { timeout: 0 });

  const img_url = [];
  const keys = [];
  const shots = [];
  const times = [];
  const start = Date.now();

  for (let i = 0; i < num_images; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    page.screenshot().then(async (shot) => {
      const time = Date.now() - start;
      keys.push(dir + `/${num}_${String(time).padStart(5, "0")}.jpg`);
      shots.push(shot);
      times.push(time);
    });
  }

  await new Promise((resolve) => setTimeout(resolve, 5000));
  await browser.close();
  server.close();
  for (let i = 0; i < shots.length; i++) {
    await S3.putObject({
      Bucket: bucket,
      ContentType: "image/jpeg",
      Key: keys[i],
      Body: shots[i],
    }).promise();

    img_url.push({
      image: S3.getSignedUrl("getObject", {
        Bucket: bucket,
        Key: keys[i],
        Expires: 86400,
      }),
      time: times[i],
    });
  }
  return img_url;
}

exports.handler = async (event) => {
  await playwright.loadFont(
    "https://raw.githack.com/minoryorg/Noto-Sans-CJK-JP/master/fonts/NotoSansCJKjp-Regular.ttf"
  );

  let html = null;
  let dir = null;
  let base_url = null;
  if (event.html && event.dir && event.base_url) {
    html = await Buffer.from(event.html, "base64");
    dir = event.dir;
    base_url = event.base_url;
  }
  if (event.body) {
    const body = JSON.parse(event.body);
    html = await Buffer.from(body.html, "base64");
    dir = body.dir;
    base_url = body.base_url;
  }
  if (!html || !dir || !base_url) return { message: "invalid argment" };

  const $ = await cheerio.load(html);
  $("*").each(function () {
    let src = $(this).attr("src");
    let href = $(this).attr("href");
    if (src) {
      src = new url.URL(src, base_url);
      $(this).attr("src", src);
    }
    if (href) {
      href = new url.URL(href, base_url);
      $(this).attr("href", href);
    }
  });
  const data = [];

  for (let i = 0; i < 3; i++) {
    data.push(await screenshot($.html(), dir, i));
  }

  return data;
};
