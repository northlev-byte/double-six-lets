import { getAccessToken } from '../_lib/google-auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messageId } = req.body;
  if (!messageId) return res.status(400).json({ error: 'Missing messageId' });

  try {
    const token = await getAccessToken();
    const r = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    );
    if (!r.ok && r.status !== 204) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message || r.status); }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Delete error:', err);
    return res.status(500).json({ error: err.message });
  }
}
