const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const CONFIG = {
  accessToken: 'act.LJHk3myqd007l4YFZ8tZo5lp7xoibBPIp1yFeh9CT3WvCQMsqhr5HTWpguLa!4697.e1',
  csvUrl: process.env.SHEET_CSV_URL
};

async function fetchVideoTarget() {
  if (!CONFIG.csvUrl) {
    console.log('⚠️ SHEET_CSV_URL missing, using test Cloudinary video.');
    return {
      videoUrl: 'https://res.cloudinary.com/demo/video/upload/dog.mp4',
      caption: 'Effortlessly stunning. #trending #reels #viral'
    };
  }

  console.log('🔍 Fetching target video from Google Sheet CSV...');
  const res = await axios.get(CONFIG.csvUrl);
  const records = parse(res.data, { columns: true, skip_empty_lines: true });

  const target = records.find(r => !r.posted || r.posted.toLowerCase() !== 'true');
  if (!target) throw new Error('No unposted videos found in CSV sheet!');

  return {
    videoUrl: target.video_url || target.cloudinary_url,
    caption: target.caption || 'Effortlessly stunning. #trending #reels #viral'
  };
}

async function downloadVideo(videoUrl, destPath) {
  console.log(`⬇️ Downloading video binary to runner: ${videoUrl}`);
  const response = await axios({
    method: 'GET',
    url: videoUrl,
    responseType: 'stream'
  });

  const writer = fs.createWriteStream(destPath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

async function publishVideoDirectFile(accessToken, filePath, caption) {
  const stats = fs.statSync(filePath);
  const videoSize = stats.size;
  console.log(`📦 Video size: ${videoSize} bytes`);

  // Step 1: Initialize upload
  console.log('🚀 Step 1: Initializing direct video upload...');
  const initPayload = {
    post_info: {
      title: caption.substring(0, 150),
      privacy_level: 'SELF_ONLY',
      disable_duet: false,
      disable_comment: false,
      disable_stitch: false,
      video_cover_timestamp_ms: 1000
    },
    source_info: {
      source: 'FILE_UPLOAD',
      video_size: videoSize,
      chunk_size: videoSize,
      total_chunk_count: 1
    }
  };

  const initRes = await axios.post(
    'https://open.tiktokapis.com/v2/post/publish/video/init/',
    initPayload,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8'
      }
    }
  );

  const initData = initRes.data;
  if (initData.error && initData.error.code !== 'ok') {
    throw new Error(`Init failed: ${JSON.stringify(initData)}`);
  }

  const uploadUrl = initData.data.upload_url;
  const publishId = initData.data.publish_id;
  console.log(`✅ Upload initialized. Publish ID: ${publishId}`);

  // Step 2: Push binary buffer
  console.log('⬆️️ Step 2: Uploading video binary directly to TikTok...');
  const fileStream = fs.createReadStream(filePath);
  await axios.put(uploadUrl, fileStream, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Range': `bytes 0-\({videoSize - 1}/\){videoSize}`,
      'Content-Length': videoSize
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  });

  console.log('🎉 Video uploaded and published successfully!');
  console.log(`📌 Final Publish ID: ${publishId}`);
}

async function run() {
  const tempFile = path.join(__dirname, 'temp_upload.mp4');
  try {
    const { videoUrl, caption } = await fetchVideoTarget();
    await downloadVideo(videoUrl, tempFile);
    await publishVideoDirectFile(CONFIG.accessToken, tempFile, caption);
    console.log('🏁 Workflow Completed Successfully!');
  } catch (err) {
    console.error('❌ Error executing TikTok workflow:');
    if (err.response?.data) {
      console.error(JSON.stringify(err.response.data, null, 2));
    } else {
      console.error(err.message);
    }
    process.exit(1);
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

run();
