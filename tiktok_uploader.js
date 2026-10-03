const { chromium } = require('playwright');
const fs = require('fs');
const https = require('https');

// =====================================================================
// ⚙️ CONFIGURATION
// =====================================================================
const CLOUD_NAME = "djlipqlut";
const BANNER_WIDTH = 380;
const BANNER_GRAVITY = "north_west";
const BANNER_MARGIN_X = 10;
const BANNER_MARGIN_Y = 40;
const FB_PAGE1_STICKER = "fbsticker_a";

const PIN_QUEUE_CSV = "https://docs.google.com/spreadsheets/d/1MrwItyy6IPNLSJbz1b53TGOTS2JBLTyg46Ql9xZpI6w/gviz/tq?tqx=out:csv&sheet=PinterestQueue";

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

function parseCSVLine(text) {
  let p = '', row = [''], i = 0, q = false;
  for (let c of text) {
    if (c === '"') {
      if (q && p === '"') row[i] += '"';
      q = !q;
    } else if (c === ',' && !q) {
      row[++i] = '';
    } else if (c === '\n' && !q) {
      break;
    } else {
      row[i] += c;
    }
    p = c;
  }
  return row;
}

async function getLatestVideoData() {
  const res = await fetch(PIN_QUEUE_CSV);
  const text = await res.text();
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length <= 1) throw new Error("Sheet CSV is empty!");

  const cols = parseCSVLine(lines[lines.length - 1]);
  const rawVideoUrl = (cols[0] || '').replace(/^"|"$/g, '').trim();
  const rawCaption = (cols[1] || '').replace(/^"|"$/g, '').trim();

  const match = rawVideoUrl.match(/\/([^\/\?]+)\.mp4/);
  const publicId = match ? match[1] : null;
  if (!publicId) throw new Error("Could not extract Public ID from: " + rawVideoUrl);

  const processedUrl = `https://res.cloudinary.com/\({CLOUD_NAME}/video/upload/l_\){FB_PAGE1_STICKER},w_\({BANNER_WIDTH},g_\){BANNER_GRAVITY},x_\({BANNER_MARGIN_X},y_\){BANNER_MARGIN_Y}/${publicId}.mp4`;
  
  let caption = rawCaption.replace(/visit\s*site/gi, '').trim();
  if (!caption) caption = "Check out this reel! #shorts #viral";

  return { processedUrl, caption };
}

(async () => {
  try {
    console.log("🔍 Fetching target video from Google Sheet CSV...");
    const { processedUrl, caption } = await getLatestVideoData();
    console.log("🎯 Video Target:", processedUrl);
    console.log("📝 Caption:", caption);

    console.log("📥 Downloading video locally for upload...");
    const localVideoPath = "./video_upload.mp4";
    await downloadFile(processedUrl, localVideoPath);
    console.log("✅ Video downloaded!");

    // Parse Cookies from GitHub Secret
    const rawCookies = process.env.TIKTOK_COOKIES;
    if (!rawCookies) throw new Error("TIKTOK_COOKIES secret missing!");
    const cookies = JSON.parse(rawCookies);

    console.log("🌐 Launching Playwright browser...");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    });

    await context.addCookies(cookies);
    const page = await context.newPage();

    console.log("🚀 Navigating to TikTok Studio Upload...");
    await page.goto('https://www.tiktok.com/tiktokstudio/upload?from=webapp&lang=en&tab=video', {
      waitUntil: 'networkidle',
      timeout: 60000
    });

    // Upload via file input
    console.log("📤 Attaching video file to uploader...");
    const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 30000 });
    await fileInput.setInputFiles(localVideoPath);

    console.log("⏳ Waiting for video preview and upload processing...");
    await page.waitForTimeout(10000);

    // Caption fill
    console.log("✍️ Setting caption...");
    const captionEditor = await page.waitForSelector('[contenteditable="true"]', { timeout: 30000 });
    await captionEditor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await captionEditor.type(caption, { delay: 50 });

    console.log("⏳ Waiting 10s before clicking post...");
    await page.waitForTimeout(10000);

    // Click Post Button
    console.log("🚀 Clicking Post button...");
    const postBtn = await page.waitForSelector('button:has-text("Post")', { timeout: 20000 });
    await postBtn.click();

    await page.waitForTimeout(15000);
    console.log("🎉 Successfully triggered Post on TikTok!");

    await browser.close();
  } catch (err) {
    console.error("❌ Upload Runner Error:", err);
    process.exit(1);
  }
})();
