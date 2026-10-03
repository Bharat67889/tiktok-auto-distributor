const axios = require('axios');
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

async function publishVideo(accessToken, videoUrl, caption) {
  console.log('🚀 Sending publish request to TikTok Content Posting API...');
  console.log(`🎯 Video Source: ${videoUrl}`);
  console.log(`📝 Caption: ${caption}`);

  const payload = {
    post_info: {
      title: caption.substring(0, 150),
      privacy_level: 'PUBLIC_TO_EVERYONE',
      disable_duet: false,
      disable_comment: false,
      disable_stitch: false,
      video_cover_timestamp_ms: 1000
    },
    source_info: {
      source: 'PULL_FROM_URL',
      video_url: videoUrl
    }
  };

  const res = await axios.post(
    'https://open.tiktokapis.com/v2/post/publish/video/init/',
    payload,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8'
      }
    }
  );

  const resData = res.data;
  console.log('API Response:', JSON.stringify(resData, null, 2));

  if (resData.error && resData.error.code !== 'ok') {
    throw new Error(`Publish failed: ${JSON.stringify(resData)}`);
  }

  console.log('🎉 Publish initiated successfully!');
  console.log(`📌 Publish ID: ${resData.data?.publish_id}`);
}

async function run() {
  try {
    const { videoUrl, caption } = await fetchVideoTarget();
    await publishVideo(CONFIG.accessToken, videoUrl, caption);
    console.log('🏁 Video Published Successfully!');
  } catch (err) {
    console.error('❌ Error executing TikTok workflow:');
    if (err.response?.data) {
      console.error(JSON.stringify(err.response.data, null, 2));
    } else {
      console.error(err.message);
    }
    process.exit(1);
  }
}

run();
