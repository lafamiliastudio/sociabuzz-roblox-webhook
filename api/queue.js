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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const sheetApiUrl = process.env.SHEET_API_URL;
  if (!sheetApiUrl) return res.status(500).json({ error: 'SHEET_API_URL not configured' });

  try {
    if (req.method === 'GET') {
      // ========== GET QUEUE ==========
      // Tidak pakai long-polling! Roblox poll tiap 5-10 detik sudah cukup.
      const lastKnownCounter = parseInt(req.query.last_counter || '0');

      const result = await callSheetAPI(sheetApiUrl, {
        action: 'getQueue',
        last_counter: lastKnownCounter
      });

      const currentCounter = result.notification_counter || 0;

      // Return 304 kalau tidak ada perubahan
      if (currentCounter === lastKnownCounter && currentCounter > 0) {
        res.setHeader('ETag', currentCounter.toString());
        return res.status(304).end();
      }

      res.setHeader('ETag', currentCounter.toString());
      res.setHeader('X-Notification-Counter', currentCounter.toString());

      return res.status(200).json({
        queue: result.queue || [],
        count: (result.queue || []).length,
        notification_counter: currentCounter,
        has_new_data: currentCounter > lastKnownCounter
      });

    } else if (req.method === 'POST') {
      // ========== ACKNOWLEDGE PROCESSED ==========
      const processedIds = req.body?.processed_ids || [];

      if (processedIds.length === 0) {
        return res.status(400).json({ error: 'No processed_ids provided' });
      }

      const result = await callSheetAPI(sheetApiUrl, {
        action: 'removeProcessed',
        processed_ids: processedIds
      });

      return res.status(200).json({
        status: 'ok',
        removed: result.removed || 0,
        remaining: result.remaining || 0
      });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (error) {
    console.error('[ERROR]', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
