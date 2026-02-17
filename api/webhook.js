const MAX_QUEUE = 100;
const MAX_HISTORY = 50;
const SHEET_NAMES = {
  QUEUE: 'Queue',
  LEADERBOARD: 'Leaderboard',
  HISTORY: 'History',
  META: 'Meta'
};

// Helper: Panggil Google Apps Script Web App
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
    // ========== TOKEN VALIDATION ==========
    const expectedToken = process.env.WEBHOOK_TOKEN;
    const sheetApiUrl = process.env.SHEET_API_URL; // URL Google Apps Script

    if (!expectedToken) return res.status(500).json({ error: 'Server misconfigured: no token' });
    if (!sheetApiUrl) return res.status(500).json({ error: 'Server misconfigured: no SHEET_API_URL' });

    const receivedToken =
      req.query.token ||
      req.body?.token ||
      req.headers['sb-webhook-token'];

    if (!receivedToken || receivedToken !== expectedToken) {
      console.warn('[UNAUTHORIZED] Invalid token');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // ========== EXTRACT DATA ==========
    const body = req.body || {};
    const timestamp = Math.floor(Date.now() / 1000);
    const donationId = body.id || `donation_${timestamp}`;
    const uniqueKey = `${donationId}_${timestamp}`;

    const donatorName = body.supporter || body.supporter_name || body.name || 'Anonymous';
    const amount = parseInt(body.amount || body.amount_settled || 0);
    const message = body.message || body.note || '';

    console.log('[NEW DONATION]', donatorName, amount, message);

    const donation = {
      id: uniqueKey,
      sociabuzz_id: donationId,
      donator: donatorName,
      amount: amount,
      message: message,
      timestamp: timestamp
    };

    // ========== KIRIM KE GOOGLE SHEETS ==========
    const result = await callSheetAPI(sheetApiUrl, {
      action: 'addDonation',
      donation: donation
    });

    console.log('[✅] Sheet updated:', result);

    return res.status(200).json({
      status: 'ok',
      unique_id: uniqueKey,
      sociabuzz_id: donationId,
      notification_counter: result.notification_counter || 0,
      data: { donator: donatorName, amount, message, timestamp }
    });

  } catch (error) {
    console.error('[ERROR]', error.message);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
