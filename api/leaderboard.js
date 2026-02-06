import { kv } from '@vercel/kv';

const MAX_LEADERBOARD = 100;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=10');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Scan semua leaderboard keys
    const keys = [];
    let cursor = 0;
    
    do {
      const result = await kv.scan(cursor, { match: 'leaderboard:*', count: 100 });
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== 0);

    if (keys.length === 0) {
      return res.status(200).json([]);
    }

    // Ambil semua values
    const leaderboard = [];
    
    for (const key of keys) {
      const name = key.replace('leaderboard:', '');
      const total = await kv.get(key);
      
      if (total && total > 0) {
        leaderboard.push({ name, total });
      }
    }

    // Sort dan limit
    leaderboard.sort((a, b) => b.total - a.total);
    const topList = leaderboard.slice(0, MAX_LEADERBOARD);

    return res.status(200).json(topList);

  } catch (error) {
    console.error('[ERROR]', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
