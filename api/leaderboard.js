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
  // Cache 10 detik - tidak perlu real-time, hemat request
  res.setHeader('Cache-Control', 'public, max-age=10');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sheetApiUrl = process.env.SHEET_API_URL;
  if (!sheetApiUrl) return res.status(500).json({ error: 'SHEET_API_URL not configured' });

  try {
    const result = await callSheetAPI(sheetApiUrl, {
      action: 'getLeaderboard'
    });

    return res.status(200).json(result.leaderboard || []);

  } catch (error) {
    console.error('[ERROR]', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
