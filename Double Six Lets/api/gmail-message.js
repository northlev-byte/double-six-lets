import { getAccessToken } from './_lib/google-auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Missing message id parameter' });
  }

  try {
    const token = await getAccessToken();

    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!msgRes.ok) {
      const err = await msgRes.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gmail fetch failed: ${msgRes.status}`);
    }

    const msg = await msgRes.json();
    const hdrs = msg.payload?.headers || [];
    const get = (n) =>
      hdrs.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value || '';

    const subject = get('Subject') || '(no subject)';
    const from = get('From');
    const rawDate = get('Date');

    let bodyText = '';
    let bodyHtml = '';

    // Extract body from MIME parts
    function extractParts(parts) {
      for (const p of parts || []) {
        if (p.mimeType === 'text/plain' && p.body?.data && !bodyText) {
          bodyText = b64d(p.body.data);
        }
        if (p.mimeType === 'text/html' && p.body?.data && !bodyHtml) {
          bodyHtml = b64d(p.body.data);
        }
        if (p.parts) extractParts(p.parts);
      }
    }

    // Check top-level body first
    if (msg.payload?.body?.data) {
      const d = b64d(msg.payload.body.data);
      if (msg.payload.mimeType === 'text/html') bodyHtml = d;
      else bodyText = d;
    }

    extractParts(msg.payload?.parts);

    const body = bodyText || bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    return res.status(200).json({
      id,
      subject,
      from,
      date: fmtDate(rawDate),
      rawDate,
      body: body.substring(0, 1000),
      bodyHtml: bodyHtml.substring(0, 8000),
    });
  } catch (err) {
    console.error('Gmail message error:', err);
    return res.status(500).json({ error: err.message });
  }
}

function b64d(data) {
  try {
    return Buffer.from(data, 'base64url').toString('utf-8');
  } catch {
    try {
      return Buffer.from(data, 'base64').toString('utf-8');
    } catch {
      return '';
    }
  }
}

function fmtDate(raw) {
  try {
    const d = new Date(raw);
    const n = new Date();
    if (d.toDateString() === n.toDateString()) {
      return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}
