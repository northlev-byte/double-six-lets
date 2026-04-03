import { getAccessToken } from '../_lib/google-auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  const { draftId, to, subject, body, threadId } = req.body;
  const from = process.env.GMAIL_USER || 'double6lets@gmail.com';

  try {
    const token = await getAccessToken();

    // Build RFC 2822 MIME message
    let mime = `From: ${from}\r\n`;
    if (to) mime += `To: ${to}\r\n`;
    mime += `Subject: ${subject || ''}\r\n`;
    mime += `Content-Type: text/plain; charset=UTF-8\r\n`;
    mime += `\r\n${body || ''}`;

    const encoded = Buffer.from(mime)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const message = { raw: encoded };
    if (threadId) message.threadId = threadId;

    let url, method;
    if (req.method === 'PATCH' && draftId) {
      // Update existing draft
      url = `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${draftId}`;
      method = 'PUT'; // Gmail API uses PUT for draft updates
    } else {
      // Create new draft
      url = 'https://gmail.googleapis.com/gmail/v1/users/me/drafts';
      method = 'POST';
    }

    const r = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });

    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message || r.status); }
    const data = await r.json();
    return res.status(200).json({ ok: true, draftId: data.id });
  } catch (err) {
    console.error('Draft error:', err);
    return res.status(500).json({ error: err.message });
  }
}
