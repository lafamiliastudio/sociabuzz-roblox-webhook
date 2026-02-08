import { kv } from '@vercel/kv';

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
    // ========== AUTHENTICATION ==========
    const adminToken = process.env.WEBHOOK_TOKEN;
    const receivedToken = req.query.token || req.body?.token || req.headers['admin-token'];

    if (!receivedToken || receivedToken !== adminToken) {
      console.warn('[UNAUTHORIZED] Invalid admin token');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // ========== EXTRACT DATA ==========
    const { name, amount } = req.body;

    if (!name || !amount) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['name', 'amount']
      });
    }

    const donationAmount = parseInt(amount);
    
    if (isNaN(donationAmount) || donationAmount <= 0) {
      return res.status(400).json({ 
        error: 'Invalid amount',
        message: 'Amount must be a positive number'
      });
    }

    console.log('==========================================');
    console.log('[WRITE LEADERBOARD REQUEST]');
    console.log('Name:', name);
    console.log('Amount:', donationAmount);
    console.log('==========================================');

    // ========== CHECK EXISTING ENTRY ==========
    const existingTotal = await kv.zscore('leaderboard', name) || 0;

    // ========== ADD TO LEADERBOARD ==========
    // ZINCRBY: Add amount to existing total (or create new entry)
    await kv.zincrby('leaderboard', donationAmount, name);
    
    const finalTotal = existingTotal + donationAmount;
    
    console.log('[✅] Updated', name, 'total to:', finalTotal);

    // ========== UPDATE HISTORY ==========
    const writeHistory = await kv.get('leaderboard_write_history') || [];
    writeHistory.unshift({
      name: name,
      amount: donationAmount,
      existing_total: existingTotal,
      final_total: finalTotal,
      is_new: existingTotal === 0,
      timestamp: Math.floor(Date.now() / 1000)
    });

    if (writeHistory.length > 100) {
      writeHistory.length = 100;
    }

    await kv.set('leaderboard_write_history', writeHistory, { ex: 2592000 }); // 30 days

    // ========== INCREMENT NOTIFICATION COUNTER ==========
    // This will trigger Roblox to check for updates
    const notifCount = await kv.incr('notification_counter');
    console.log('[✅] Notification counter:', notifCount);

    console.log('[✅] Write completed successfully');

    return res.status(200).json({
      status: 'ok',
      action: existingTotal > 0 ? 'updated' : 'created',
      name: name,
      amount: donationAmount,
      existing_total: existingTotal,
      final_total: finalTotal,
      notification_counter: notifCount,
      message: existingTotal > 0 
        ? `Added ${donationAmount} to ${name} (was ${existingTotal}, now ${finalTotal})`
        : `Created new entry for ${name} with ${finalTotal}`
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
