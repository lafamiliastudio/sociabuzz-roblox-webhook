import { kv } from '@vercel/kv';

const LONG_POLL_TIMEOUT = 25000;
const POLL_INTERVAL = 500;
const MAX_RETRIES = Math.floor(LONG_POLL_TIMEOUT / POLL_INTERVAL);
const MAX_LEADERBOARD = 100;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const lastKnownCounter = parseInt(req.query.last_counter || req.headers['if-none-match'] || '0');
    const enableLongPoll = req.query.long_poll !== 'false';
    const includeLeaderboard = req.query.leaderboard !== 'false'; // Default: included
    
    let attempts = 0;
    let currentCounter = await kv.get('notification_counter') || 0;

    // Long polling: wait for new data
    while (enableLongPoll && attempts < MAX_RETRIES) {
      if (currentCounter > lastKnownCounter) {
        break;
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      currentCounter = await kv.get('notification_counter') || 0;
      attempts++;
    }

    // Parallel fetch for efficiency
    const [queue, leaderboardResults] = await Promise.all([
      kv.get('donation_queue'),
      includeLeaderboard 
        ? kv.zrange('leaderboard', 0, MAX_LEADERBOARD - 1, { rev: true, withScores: true })
        : Promise.resolve(null)
    ]);

    const queueData = queue || [];

    // Transform leaderboard if requested
    let leaderboard = null;
    if (includeLeaderboard && leaderboardResults && leaderboardResults.length > 0) {
      leaderboard = [];
      for (let i = 0; i < leaderboardResults.length; i += 2) {
        const name = leaderboardResults[i];
        const total = leaderboardResults[i + 1];
        if (name && total > 0) {
          leaderboard.push({ name, total: parseInt(total) });
        }
      }
    }

    // Return 304 if no changes
    if (currentCounter === lastKnownCounter && currentCounter > 0) {
      res.setHeader('ETag', currentCounter.toString());
      return res.status(304).end();
    }

    res.setHeader('ETag', currentCounter.toString());
    res.setHeader('X-Notification-Counter', currentCounter.toString());

    return res.status(200).json({
      queue: queueData,
      queue_count: queueData.length,
      leaderboard: leaderboard,
      leaderboard_count: leaderboard ? leaderboard.length : 0,
      notification_counter: currentCounter,
      has_new_data: currentCounter > lastKnownCounter,
      long_poll_waited: attempts * POLL_INTERVAL
    });

  } catch (error) {
    console.error('[ERROR]', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
