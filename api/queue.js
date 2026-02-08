import { kv } from '@vercel/kv';

const LONG_POLL_TIMEOUT = 25000; // 25 seconds (Vercel limit: 30s)
const POLL_INTERVAL = 500; // Check every 500ms during long poll
const MAX_RETRIES = Math.floor(LONG_POLL_TIMEOUT / POLL_INTERVAL);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      // ========== LONG POLLING GET ==========
      const lastKnownCounter = parseInt(req.query.last_counter || req.headers['if-none-match'] || '0');
      const enableLongPoll = req.query.long_poll !== 'false'; // Default: enabled
      
      let attempts = 0;
      let currentCounter = await kv.get('notification_counter') || 0;

      // Long polling: wait for new data
      while (enableLongPoll && attempts < MAX_RETRIES) {
        if (currentCounter > lastKnownCounter) {
          // New data available!
          break;
        }

        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
        currentCounter = await kv.get('notification_counter') || 0;
        attempts++;
      }

      // Return 304 if no changes (save bandwidth)
      if (currentCounter === lastKnownCounter && currentCounter > 0) {
        res.setHeader('ETag', currentCounter.toString());
        return res.status(304).end();
      }

      // Fetch queue
      const queue = await kv.get('donation_queue') || [];

      res.setHeader('ETag', currentCounter.toString());
      res.setHeader('X-Notification-Counter', currentCounter.toString());
      res.setHeader('X-Long-Poll-Attempts', attempts.toString());

      return res.status(200).json({
        queue: queue,
        count: queue.length,
        notification_counter: currentCounter,
        has_new_data: currentCounter > lastKnownCounter,
        long_poll_waited: attempts * POLL_INTERVAL
      });

    } else if (req.method === 'POST') {
      // ========== ACKNOWLEDGE/CLEAR PROCESSED DONATIONS ==========
      const body = req.body || {};
      const processedIds = body.processed_ids || [];

      if (processedIds.length > 0) {
        let queue = await kv.get('donation_queue') || [];
        
        // Remove processed donations
        const beforeCount = queue.length;
        queue = queue.filter(donation => !processedIds.includes(donation.id));
        const removedCount = beforeCount - queue.length;
        
        await kv.set('donation_queue', queue);
        
        console.log('[QUEUE] Removed', removedCount, 'processed donations');
        console.log('[QUEUE] Remaining:', queue.length);

        return res.status(200).json({
          status: 'ok',
          removed: removedCount,
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
