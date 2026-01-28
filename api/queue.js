import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      // ========== GET QUEUE ==========
      const queue = await kv.get('donation_queue') || [];
      const notifCounter = await kv.get('notification_counter') || 0;

      return res.status(200).json({
        queue: queue,
        count: queue.length,
        notification_counter: notifCounter
      });

    } else if (req.method === 'POST') {
      // ========== ACKNOWLEDGE/CLEAR PROCESSED DONATIONS ==========
      const body = req.body || {};
      const processedIds = body.processed_ids || [];

      if (processedIds.length > 0) {
        let queue = await kv.get('donation_queue') || [];
        
        // Remove processed donations from queue
        queue = queue.filter(donation => !processedIds.includes(donation.id));
        
        await kv.set('donation_queue', queue);
        
        console.log('[QUEUE] Removed', processedIds.length, 'processed donations');
        console.log('[QUEUE] Remaining:', queue.length);

        return res.status(200).json({
          status: 'ok',
          removed: processedIds.length,
          remaining: queue.length
        });
      }

      return res.status(400).json({ error: 'No processed_ids provided' });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (error) {
    console.error('[ERROR]', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
