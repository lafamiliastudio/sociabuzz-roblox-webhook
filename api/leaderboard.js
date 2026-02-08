// ==========================================
// LEADERBOARD ENDPOINT - OPTIMIZED WITH ZSET
// Redis command reduction: 1 command instead of 100+
// ==========================================

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
    // ========== FETCH LEADERBOARD (OPTIMIZED) ==========
    // ✅ BEFORE: SCAN (3 commands) + GET×100 = ~103 commands
    // ✅ AFTER: ZREVRANGE WITHSCORES = 1 command 🎯
    
    const results = await kv.zrange('leaderboard', 0, MAX_LEADERBOARD - 1, {
      rev: true,
      withScores: true
    });

    if (!results || results.length === 0) {
      return res.status(200).json([]);
    }

    // ========== TRANSFORM TO EXPECTED FORMAT ==========
    // results format: [member1, score1, member2, score2, ...]
    const leaderboard = [];
    
    for (let i = 0; i < results.length; i += 2) {
      const name = results[i];
      const total = results[i + 1];
      
      if (name && total > 0) {
        leaderboard.push({ 
          name, 
          total: parseInt(total) 
        });
      }
    }

    console.log('[✅] Fetched leaderboard with 1 command. Entries:', leaderboard.length);

    return res.status(200).json(leaderboard);

  } catch (error) {
    console.error('[ERROR]', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
