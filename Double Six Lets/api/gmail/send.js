import { getAccessToken } from '../_lib/google-auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { to, subject, body, threadId, inReplyTo, references } = req.body;
  if (!to || !body) return res.status(400).json({ error: 'Missing to or body' });

  try {
    const token = await getAccessToken();
    const from = process.env.GMAIL_USER || 'double6lets@gmail.com';

    // Build RFC 2822 MIME message
    let mime = `From: ${from}\r\n`;
    mime += `To: ${to}\r\n`;
    mime += `Subject: ${subject || ''}\r\n`;
    mime += `Content-Type: text/plain; charset=UTF-8\r\n`;
    if (inReplyTo) mime += `In-Reply-To: ${inReplyTo}\r\n`;
    if (references) mime += `References: ${references}\r\n`;
    mime += `\r\n${body}`;

    // Base64url encode
    const encoded = Buffer.from(mime)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const payload = { raw: encoded };
    if (threadId) payload.threadId = threadId;

    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message || r.status); }
    const data = await r.json();
    return res.status(200).json({ ok: true, messageId: data.id });
  } catch (err) {
    console.error('Send error:', err);
    return res.status(500).json({ error: err.message });
  }
}
