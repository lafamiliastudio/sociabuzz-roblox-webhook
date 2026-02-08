// ==========================================
// MIGRATION SCRIPT: Hash Keys → ZSET
// Run once to convert existing leaderboard data
// ==========================================

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // ========== AUTHENTICATION ==========
    const adminToken = process.env.WEBHOOK_TOKEN;
    const receivedToken = req.query.token || req.body?.token || req.headers['admin-token'];

    if (!receivedToken || receivedToken !== adminToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('==========================================');
    console.log('[MIGRATION STARTED]');
    console.log('Converting leaderboard:* keys to ZSET');
    console.log('==========================================');

    // ========== SCAN OLD KEYS ==========
    const oldKeys = [];
    let cursor = 0;
    
    do {
      const result = await kv.scan(cursor, { match: 'leaderboard:*', count: 100 });
      cursor = result[0];
      oldKeys.push(...result[1]);
    } while (cursor !== 0);

    console.log('[INFO] Found', oldKeys.length, 'old leaderboard entries');

    if (oldKeys.length === 0) {
      return res.status(200).json({
        status: 'ok',
        message: 'No data to migrate',
        migrated: 0
      });
    }

    // ========== MIGRATE TO ZSET ==========
    let migrated = 0;
    const errors = [];

    for (const key of oldKeys) {
      try {
        const name = key.replace('leaderboard:', '');
        const total = await kv.get(key);
        
        if (total && total > 0) {
          // Add to sorted set
          await kv.zadd('leaderboard', { score: total, member: name });
          migrated++;
          console.log('[✅] Migrated:', name, '→', total);
        }
        
        // Delete old key
        await kv.del(key);
        
      } catch (error) {
        console.error('[ERROR] Failed to migrate:', key, error.message);
        errors.push({ key, error: error.message });
      }
    }

    console.log('==========================================');
    console.log('[MIGRATION COMPLETED]');
    console.log('Migrated:', migrated);
    console.log('Errors:', errors.length);
    console.log('==========================================');

    return res.status(200).json({
      status: 'ok',
      message: 'Migration completed',
      migrated: migrated,
      total_old_keys: oldKeys.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('[ERROR]', error.message);
    return res.status(500).json({ 
      error: 'Migration failed',
      details: error.message 
    });
  }
}
