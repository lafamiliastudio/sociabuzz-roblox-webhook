// ==========================================
// WEBHOOK RECEIVER DARI SOCIABUZZ
// Menggunakan Vercel KV untuk persistent storage
// ==========================================

import { kv } from '@vercel/kv';

const MAX_HISTORY = 50;
const CACHE_TTL = 86400; // 24 jam (detik)

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
      console.error('[CRITICAL] WEBHOOK_TOKEN not configured');
      return res.status(500).json({ error: 'Server misconfigured' });
    }

    const receivedToken = 
      req.query.token ||
      req.body?.token ||
      req.headers['sb-webhook-token'];

    if (!receivedToken || receivedToken !== expectedToken) {
      console.warn('[SECURITY] Invalid or missing token');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // ========== EXTRACT DATA ==========
    const body = req.body || {};

    const donationId = body.id || `donation_${Date.now()}`;
    const donatorName = body.supporter || body.supporter_name || body.name || 'Anonymous';
    const amount = parseInt(body.amount || body.amount_settled || 0);
    const message = body.message || body.note || '';

    if (!donationId) {
      return res.status(400).json({ error: 'Missing donation ID' });
    }

    // ========== CEK DUPLIKASI DI KV ==========
    const existingDonation = await kv.get(`donation:${donationId}`);
    
    if (existingDonation) {
      console.log(`[SKIP] Duplicate: ${donationId}`);
      return res.status(200).json({ 
        status: 'ok', 
        message: 'Already processed' 
      });
    }

    // ========== SIMPAN DONASI ==========
    const donation = {
      id: donationId,
      donator: donatorName,
      amount: amount,
      message: message,
      timestamp: Math.floor(Date.now() / 1000)
    };

    // Simpan donation individual (untuk duplikasi check)
    await kv.set(`donation:${donationId}`, donation, { ex: CACHE_TTL });

    // Update LAST DONATION (yang dipake Roblox)
    await kv.set('latest_donation', donation);

    // ========== UPDATE HISTORY ==========
    // Ambil history lama
    let history = await kv.get('donation_history') || [];
    
    // Tambah donation baru di depan
    history.unshift(donation);
    
    // Limit ke 50
    if (history.length > MAX_HISTORY) {
      history = history.slice(0, MAX_HISTORY);
    }
    
    // Simpan history
    await kv.set('donation_history', history, { ex: CACHE_TTL });

    // ========== UPDATE LEADERBOARD ==========
    const leaderboardKey = `leaderboard:${donatorName}`;
    const currentTotal = await kv.get(leaderboardKey) || 0;
    await kv.set(leaderboardKey, currentTotal + amount);

    console.log(`[✅ SUCCESS] NEW DONATION!`);
    console.log(`[✅] Donator: ${donatorName}`);
    console.log(`[✅] Amount: Rp${amount}`);
    console.log(`[✅] Message: "${message}"`);

    return res.status(200).json({ 
      status: 'ok',
      donation_id: donationId,
      message: 'Donation received and stored',
      data: {
        donator: donatorName,
        amount: amount,
        message: message
      }
    });

  } catch (error) {
    console.error('[❌ ERROR]', error.message);
    console.error('[❌ STACK]', error.stack);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}
