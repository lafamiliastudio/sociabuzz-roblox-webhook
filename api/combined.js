async function callSheetAPI(sheetApiUrl, payload) {
  const res = await fetch(sheetApiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Sheet API error: ${res.status}`);
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sheetApiUrl = process.env.SHEET_API_URL;
  if (!sheetApiUrl) return res.status(500).json({ error: 'SHEET_API_URL not configured' });

  try {
    const lastKnownCounter = parseInt(req.query.last_counter || '0');
    const includeLeaderboard = req.query.leaderboard !== 'false';

    // Satu panggilan ke Google Sheets untuk semua data
    const result = await callSheetAPI(sheetApiUrl, {
      action: 'getCombined',
      last_counter: lastKnownCounter,
      include_leaderboard: includeLeaderboard
    });

    const currentCounter = result.notification_counter || 0;

    if (currentCounter === lastKnownCounter && currentCounter > 0) {
      res.setHeader('ETag', currentCounter.toString());
      return res.status(304).end();
    }

    res.setHeader('ETag', currentCounter.toString());
    res.setHeader('X-Notification-Counter', currentCounter.toString());

    return res.status(200).json({
      queue: result.queue || [],
      queue_count: (result.queue || []).length,
      leaderboard: result.leaderboard || null,
      leaderboard_count: (result.leaderboard || []).length,
      notification_counter: currentCounter,
      has_new_data: currentCounter > lastKnownCounter
    });

  } catch (error) {
    console.error('[ERROR]', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
