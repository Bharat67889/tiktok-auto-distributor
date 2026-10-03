const { chromium } = require('playwright');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const CONFIG = {
  sessionid: process.env.TIKTOK_SESSION_ID,
  csvUrl: process.env.SHEET_CSV_URL
};

async function fetchVideoTarget() {
  if (!CONFIG.csvUrl) {
    console.log('⚠️ SHEET_CSV_URL missing, using default test video.');
    return {
      videoUrl: 'https://res.cloudinary.com/demo/video/upload/dog.mp4',
      caption: 'Effortlessly stunning. #trending #viral #fyp'
    };
  }

  console.log('🔍 Fetching target video from CSV...');
  const res = await axios.get(CONFIG.csvUrl);
  const records = parse(res.data, { columns: true, skip_empty_lines: true });
  const target = records.find(r => !r.posted || r.posted.toLowerCase() !== 'true');
  if (!target) throw new Error('No unposted rows found in CSV sheet!');

  return {
    videoUrl: target.video_url || target.cloudinary_url,
    caption: target.caption || 'Effortlessly stunning. #trending #viral #fyp'
  };
}

async function downloadVideo(url, outputPath) {
  console.log(`⬇️ Downloading video: ${url}`);
  const response = await axios({
    method: 'GET',
    url,
    responseType: 'stream'
  });
  const writer = fs.createWriteStream(outputPath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

async function run() {
  const tempVideo = path.join(__dirname, 'upload_temp.mp4');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=1920,1080'
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US'
  });

  const page = await context.newPage();

  try {
    const { videoUrl, caption } = await fetchVideoTarget();
    await downloadVideo(videoUrl, tempVideo);

    console.log('🍪 Injecting session cookies...');
    if (CONFIG.sessionid) {
      await context.addCookies([
        {
          name: 'sessionid',
          value: CONFIG.sessionid,
          domain: '.tiktok.com',
          path: '/',
          httpOnly: true,
          secure: true
        }
      ]);
    }

    console.log('🌐 Opening TikTok Creator Upload Studio...');
    await page.goto('https://www.tiktok.com/creator-center/upload?from=upload', {
      waitUntil: 'networkidle',
      timeout: 60000
    });

    console.log('📸 Capturing initial page snapshot...');
    await page.screenshot({ path: 'step1_loaded.png', fullPage: true });

    // Handle Upload File Input
    console.log('📁 Locating file upload input element...');
    let fileInput = await page.$('input[type="file"]');
    
    // Check inside iframe if not in main document
    if (!fileInput) {
      for (const frame of page.frames()) {
        fileInput = await frame.$('input[type="file"]');
        if (fileInput) break;
      }
    }

    if (!fileInput) {
      await page.screenshot({ path: 'error_no_file_input.png', fullPage: true });
      throw new Error('File input not found. Snapshot saved to error_no_file_input.png');
    }

    console.log('⬆️ Setting file into input element...');
    await fileInput.setInputFiles(tempVideo);

    console.log('⏳ Waiting for upload processing...');
    await page.waitForTimeout(10000);
    await page.screenshot({ path: 'step2_uploaded.png', fullPage: true });

    // Handle Caption Input
    console.log('📝 Setting caption...');
    const captionSelector = 'div[contenteditable="true"], .notranslate.public-DraftEditor-content, textarea';
    const captionEl = await page.$(captionSelector);
    if (captionEl) {
      await captionEl.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await page.keyboard.type(caption, { delay: 40 });
    }

    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'step3_caption.png', fullPage: true });

    // Click Post Button
    console.log('🚀 Searching for Post button...');
    const postButton = await page.$('button:has-text("Post"), div[role="button"]:has-text("Post")');
    if (postButton) {
      await postButton.click();
      console.log('✅ Clicked Post button!');
      await page.waitForTimeout(8000);
      await page.screenshot({ path: 'step4_final.png', fullPage: true });
    } else {
      console.log('⚠️️ Post button selector missed.');
      await page.screenshot({ path: 'error_post_button.png', fullPage: true });
    }

  } catch (err) {
    console.error('❌ Automation Error:', err.message);
    await page.screenshot({ path: 'error_failure.png', fullPage: true }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
    if (fs.existsSync(tempVideo)) {
      fs.unlinkSync(tempVideo);
    }
  }
}

run();
