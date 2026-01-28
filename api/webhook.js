// ==========================================
// SOCIABUZZ WEBHOOK - PUSH BASED
// Real-time notification via queue system
// ==========================================

import { kv } from '@vercel/kv';

const MAX_HISTORY = 50;
const CACHE_TTL = 86400; // 24 jam

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // ========== TOKEN VALIDATION ==========
    const expectedToken = process.env.WEBHOOK_TOKEN;
    
    if (!expectedToken) {
      console.error('[ERROR] WEBHOOK_TOKEN not set');
      return res.status(500).json({ error: 'Server misconfigured' });
    }

    const receivedToken = 
      req.query.token ||
      req.body?.token ||
      req.headers['sb-webhook-token'];

    if (!receivedToken || receivedToken !== expectedToken) {
      console.warn('[UNAUTHORIZED] Invalid token');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // ========== EXTRACT DATA ==========
    const body = req.body || {};
    
    // PENTING: Gunakan timestamp sebagai unique identifier
    const timestamp = Math.floor(Date.now() / 1000);
    const donationId = body.id || `donation_${timestamp}`;
    const uniqueKey = `${donationId}_${timestamp}`; // ID + timestamp = truly unique
    
    const donatorName = body.supporter || body.supporter_name || body.name || 'Anonymous';
    const amount = parseInt(body.amount || body.amount_settled || 0);
    const message = body.message || body.note || '';

    console.log('==========================================');
    console.log('[NEW DONATION WEBHOOK]');
    console.log('Unique Key:', uniqueKey);
    console.log('Sociabuzz ID:', donationId);
    console.log('Donator:', donatorName);
    console.log('Amount:', amount);
    console.log('Message:', message);
    console.log('Timestamp:', timestamp);
    console.log('==========================================');

    // ========== CREATE DONATION OBJECT ==========
    const donation = {
      id: uniqueKey, // Unique ID = sociabuzz_id + timestamp
      sociabuzz_id: donationId, // Original ID dari Sociabuzz
      donator: donatorName,
      amount: amount,
      message: message,
      timestamp: timestamp
    };

    // ========== TAMBAHKAN KE QUEUE (untuk Roblox pickup) ==========
    // Roblox akan ambil dari queue ini secara FIFO
    const queueKey = 'donation_queue';
    let queue = await kv.get(queueKey) || [];
    
    queue.push(donation);
    
    // Limit queue size
    if (queue.length > 100) {
      queue = queue.slice(-100); // Keep last 100
    }
    
    await kv.set(queueKey, queue, { ex: CACHE_TTL });
    console.log('[✅] Added to queue. Queue size:', queue.length);

    // ========== UPDATE LATEST DONATION (fallback untuk polling) ==========
    await kv.set('latest_donation', donation);

    // ========== SAVE TO HISTORY ==========
    let history = await kv.get('donation_history') || [];
    history.unshift(donation);
    
    if (history.length > MAX_HISTORY) {
      history = history.slice(0, MAX_HISTORY);
    }
    
    await kv.set('donation_history', history, { ex: CACHE_TTL });

    // ========== UPDATE LEADERBOARD ==========
    const leaderboardKey = `leaderboard:${donatorName}`;
    const currentTotal = await kv.get(leaderboardKey) || 0;
    await kv.set(leaderboardKey, currentTotal + amount);

    // ========== INCREMENT NOTIFICATION COUNTER ==========
    // Roblox akan monitor counter ini untuk tahu ada donasi baru
    const notifCount = await kv.incr('notification_counter');
    console.log('[✅] Notification counter:', notifCount);

    console.log('[✅] Donation processed successfully');

    return res.status(200).json({ 
      status: 'ok',
      unique_id: uniqueKey,
      sociabuzz_id: donationId,
      queue_position: queue.length,
      notification_counter: notifCount,
      data: {
        donator: donatorName,
        amount: amount,
        message: message,
        timestamp: timestamp
      }
    });

  } catch (error) {
    console.error('[ERROR]', error.message);
    console.error(error.stack);
    
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}
