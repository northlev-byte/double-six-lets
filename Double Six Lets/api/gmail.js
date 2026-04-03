import { getAccessToken } from './_lib/google-auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = await getAccessToken();
    const label = req.query.label || 'INBOX';

    // 1. List message IDs (metadata only for speed)
    // For INBOX, exclude Promotions/Social/Updates/Forums via query rather than requiring CATEGORY_PERSONAL
    let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&labelIds=${encodeURIComponent(label)}`;
    if (label === 'INBOX') url += '&q=' + encodeURIComponent('-category:promotions -category:social -category:updates -category:forums');

    const listRes = await fetch(url,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!listRes.ok) {
      const err = await listRes.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gmail list failed: ${listRes.status}`);
    }

    const listData = await listRes.json();
    const ids = (listData.messages || []).map((m) => m.id);

    if (!ids.length) {
      return res.status(200).json({ emails: [] });
    }

    // 2. Fetch metadata for each message in parallel batches of 20
    const emails = [];
    for (let i = 0; i < ids.length; i += 20) {
      const batch = await Promise.all(
        ids.slice(i, i + 20).map((id) => fetchMetadata(id, token))
      );
      emails.push(...batch.filter(Boolean));
    }

    return res.status(200).json({ emails });
  } catch (err) {
    console.error('Gmail fetch error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function fetchMetadata(id, token) {
  try {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) return null;

    const msg = await res.json();
    const hdrs = msg.payload?.headers || [];
    const get = (n) =>
      hdrs.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value || '';

    const subject = get('Subject') || '(no subject)';
    const from = get('From');
    const rawDate = get('Date');
    const unread = (msg.labelIds || []).includes('UNREAD');
    const snippet = msg.snippet || '';

    return {
      id,
      subject,
      from,
      date: fmtDate(rawDate),
      rawDate,
      preview: snippet.substring(0, 90),
      body: '', // Fetched on demand via /api/gmail-message
      bodyHtml: '',
      unread,
      category: 'Other',
      property: null,
      urgent: false,
      hasInvoice: false,
      logged: false,
    };
  } catch {
    return null;
  }
}

function fmtDate(raw) {
  try {
    const d = new Date(raw);
    const n = new Date();
    if (d.toDateString() === n.toDateString()) {
      return d.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}
