export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('X-Deprecated', 'Use /api/queue and /api/leaderboard separately');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  return res.status(200).json({
    queue: [],
    queue_count: 0,
    leaderboard: [],
    leaderboard_count: 0,
    notification_counter: parseInt(req.query.last_counter || '0'),
    has_new_data: false,
    _deprecated: true,
    _message: 'This endpoint is deprecated. Use /api/queue and /api/leaderboard separately.'
  });
}
