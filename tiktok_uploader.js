const axios = require('axios');
const { parse } = require('csv-parse/sync');

// Configuration
const CONFIG = {
  clientKey: 'sbawfr1212ig8iqpw0',
  clientSecret: 'Q0wiyjiMbskrSOvmWTb12LHqMCpoZBG3',
  redirectUri: 'https://bharat67889.github.io/vault-/',
  authCode: '16Ur-Vpym2NGChly3KTYbF8ox-AyWdiEPdBBuhkCn3WvivZk1fmrj7aHFnmJQLSYcuVc4FD5yHGdnTYa6YQ9St1tU2v7reBbpyDTHubzw5uEcbph02tKz_XcohG2-ykDFTpRAQqGG8rQKTvSaZbydZjrnh3UtH2FSdkUGZjz564wxCRf8w6Dsyb_yRoMxaf7wkr3i4EJ-zjyWwpYJaOw8Fz7BlP__FekRNDnsw*v!4741.e1',
  csvUrl: process.env.SHEET_CSV_URL
};

async function getAccessToken() {
  console.log('🔑 Exchanging authorization code for Access Token...');
  const params = new URLSearchParams({
    client_key: CONFIG.clientKey,
    client_secret: CONFIG.clientSecret,
    code: CONFIG.authCode,
    grant_type: 'authorization_code',
    redirect_uri: CONFIG.redirectUri
  });

  const response = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', params.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache'
    }
  });

  const data = response.data;
  if (data.error || !data.data?.access_token) {
    throw new Error(`Token Exchange Failed: ${JSON.stringify(data)}`);
  }

  console.log('✅ Access Token acquired successfully!');
  return data.data.access_token;
}

async function fetchVideoTarget() {
  if (!CONFIG.csvUrl) {
    console.log('⚠️ SHEET_CSV_URL secret missing, using default direct video URL.');
    return {
      videoUrl: 'https://res.cloudinary.com/demo/video/upload/dog.mp4',
      caption: 'Automated post via TikTok API #trending #viral'
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
  console.log('🚀 Sending direct video publish request to TikTok Content Posting API...');
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
  if (resData.error && resData.error.code !== 'ok') {
    throw new Error(`Publish failed: ${JSON.stringify(resData)}`);
  }

  console.log('🎉 Publish initiated successfully!');
  console.log(`📌 Publish ID: ${resData.data?.publish_id}`);
}

async function run() {
  try {
    const accessToken = await getAccessToken();
    const { videoUrl, caption } = await fetchVideoTarget();
    await publishVideo(accessToken, videoUrl, caption);
    console.log('🏁 Workflow Completed Successfully!');
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
