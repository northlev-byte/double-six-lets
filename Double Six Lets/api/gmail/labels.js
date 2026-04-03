import { getAccessToken } from '../_lib/google-auth.js';

const FRIENDLY_NAMES = {
  INBOX: 'Inbox', SENT: 'Sent', DRAFT: 'Drafts', TRASH: 'Trash',
  SPAM: 'Spam', STARRED: 'Starred', IMPORTANT: 'Important',
  UNREAD: 'Unread', CATEGORY_PERSONAL: 'Personal',
  CATEGORY_SOCIAL: 'Social', CATEGORY_PROMOTIONS: 'Promotions',
  CATEGORY_UPDATES: 'Updates', CATEGORY_FORUMS: 'Forums',
};

const SYSTEM_ORDER = ['INBOX','STARRED','SENT','DRAFT','IMPORTANT','SPAM','TRASH'];

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = await getAccessToken();
    const lr = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!lr.ok) { const e = await lr.json().catch(() => ({})); throw new Error(e.error?.message || `Labels failed: ${lr.status}`); }
    const data = await lr.json();

    const labels = (data.labels || []).map(l => ({
      id: l.id,
      name: FRIENDLY_NAMES[l.id] || l.name,
      type: l.type,
      messagesTotal: l.messagesTotal || 0,
      messagesUnread: l.messagesUnread || 0,
    }));

    // Sort: system labels in defined order first, then user labels alphabetically
    const system = labels.filter(l => l.type === 'system' && SYSTEM_ORDER.includes(l.id))
      .sort((a, b) => SYSTEM_ORDER.indexOf(a.id) - SYSTEM_ORDER.indexOf(b.id));
    const user = labels.filter(l => l.type === 'user').sort((a, b) => a.name.localeCompare(b.name));

    return res.status(200).json({ labels: [...system, ...user] });
  } catch (err) {
    console.error('Labels error:', err);
    return res.status(500).json({ error: err.message });
  }
}
