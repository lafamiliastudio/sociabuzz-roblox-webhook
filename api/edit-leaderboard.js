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
    const { old_name, new_name } = req.body;

    if (!old_name || !new_name) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['old_name', 'new_name']
      });
    }

    console.log('==========================================');
    console.log('[EDIT LEADERBOARD REQUEST]');
    console.log('Old Name:', old_name);
    console.log('New Name:', new_name);
    console.log('==========================================');

    // ========== GET OLD TOTAL ==========
    const oldKey = `leaderboard:${old_name}`;
    const oldTotal = await kv.get(oldKey);

    if (!oldTotal || oldTotal === 0) {
      return res.status(404).json({ 
        error: 'Donator not found',
        name: old_name
      });
    }

    console.log('[INFO] Found', old_name, 'with total:', oldTotal);

    // ========== CHECK IF NEW NAME EXISTS ==========
    const newKey = `leaderboard:${new_name}`;
    const existingTotal = await kv.get(newKey) || 0;

    // ========== MERGE OR REPLACE ==========
    const finalTotal = existingTotal + oldTotal;
    
    await kv.set(newKey, finalTotal);
    console.log('[✅] Set', new_name, 'total to:', finalTotal);

    // ========== DELETE OLD ENTRY ==========
    await kv.del(oldKey);
    console.log('[✅] Deleted old entry:', old_name);

    // ========== UPDATE HISTORY ==========
    const editHistory = await kv.get('leaderboard_edit_history') || [];
    editHistory.unshift({
      old_name: old_name,
      new_name: new_name,
      old_total: oldTotal,
      new_total: finalTotal,
      merged: existingTotal > 0,
      timestamp: Math.floor(Date.now() / 1000)
    });

    if (editHistory.length > 100) {
      editHistory.length = 100;
    }

    await kv.set('leaderboard_edit_history', editHistory, { ex: 2592000 });

    console.log('[✅] Edit completed successfully');

    return res.status(200).json({
      status: 'ok',
      action: existingTotal > 0 ? 'merged' : 'renamed',
      old_name: old_name,
      new_name: new_name,
      old_total: oldTotal,
      existing_total: existingTotal,
      final_total: finalTotal,
      message: existingTotal > 0 
        ? `Merged ${old_name} (${oldTotal}) into ${new_name} (was ${existingTotal}, now ${finalTotal})`
        : `Renamed ${old_name} to ${new_name} (${finalTotal})`
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
