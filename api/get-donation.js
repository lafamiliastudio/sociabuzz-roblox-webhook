import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Ambil dari Vercel KV
    const lastDonation = await kv.get('latest_donation');

    if (!lastDonation) {
      return res.status(200).json({ 
        data: null,
        message: 'No donations yet'
      });
    }

    // Return data
    return res.status(200).json({
      id: lastDonation.id,
      donator: lastDonation.donator,
      amount: lastDonation.amount,
      message: lastDonation.message,
      timestamp: lastDonation.timestamp
    });

  } catch (error) {
    console.error('[ERROR]', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
