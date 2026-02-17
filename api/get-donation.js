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
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sheetApiUrl = process.env.SHEET_API_URL;
  if (!sheetApiUrl) return res.status(500).json({ error: 'SHEET_API_URL not configured' });

  try {
    const result = await callSheetAPI(sheetApiUrl, {
      action: 'getLatestDonation'
    });

    if (!result.donation) {
      return res.status(200).json({ data: null, message: 'No donations yet' });
    }

    return res.status(200).json({
      id: result.donation.id,
      donator: result.donation.donator,
      amount: result.donation.amount,
      message: result.donation.message,
      timestamp: result.donation.timestamp
    });

  } catch (error) {
    console.error('[ERROR]', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
