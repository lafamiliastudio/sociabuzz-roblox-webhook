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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const adminToken = process.env.WEBHOOK_TOKEN;
    const sheetApiUrl = process.env.SHEET_API_URL;

    const receivedToken = req.query.token || req.body?.token || req.headers['admin-token'];
    if (!receivedToken || receivedToken !== adminToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { old_name, new_name } = req.body;
    if (!old_name || !new_name) {
      return res.status(400).json({ error: 'Missing old_name or new_name' });
    }

    const result = await callSheetAPI(sheetApiUrl, {
      action: 'editLeaderboard',
      old_name: old_name,
      new_name: new_name
    });

    if (result.error) {
      return res.status(404).json({ error: result.error, name: old_name });
    }

    return res.status(200).json({
      status: 'ok',
      action: result.merged ? 'merged' : 'renamed',
      old_name: old_name,
      new_name: new_name,
      old_total: result.old_total || 0,
      existing_total: result.existing_total || 0,
      final_total: result.final_total || 0,
      message: result.message
    });

  } catch (error) {
    console.error('[ERROR]', error.message);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
