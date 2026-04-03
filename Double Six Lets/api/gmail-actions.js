import { getAccessToken } from './_lib/google-auth.js';

const FRIENDLY_NAMES = {
  INBOX: 'Inbox', SENT: 'Sent', DRAFT: 'Drafts', TRASH: 'Trash',
  SPAM: 'Spam', STARRED: 'Starred', IMPORTANT: 'Important',
  UNREAD: 'Unread', CATEGORY_PERSONAL: 'Personal',
  CATEGORY_SOCIAL: 'Social', CATEGORY_PROMOTIONS: 'Promotions',
  CATEGORY_UPDATES: 'Updates', CATEGORY_FORUMS: 'Forums',
};
const SYSTEM_ORDER = ['INBOX','STARRED','SENT','DRAFT','IMPORTANT','SPAM','TRASH'];

export default async function handler(req, res) {
  // GET = labels, POST = actions
  if (req.method === 'GET') return handleLabels(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.body;
  switch (action) {
    case 'trash': return handleTrash(req, res);
    case 'delete': return handleDelete(req, res);
    case 'archive': return handleArchive(req, res);
    case 'move': return handleMove(req, res);
    case 'mark-read': return handleMarkRead(req, res);
    case 'send': return handleSend(req, res);
    case 'save-draft': return handleSaveDraft(req, res);
    default: return res.status(400).json({ error: `Unknown action: ${action}` });
  }
}

async function handleLabels(req, res) {
  try {
    const token = await getAccessToken();
    const lr = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!lr.ok) { const e = await lr.json().catch(() => ({})); throw new Error(e.error?.message || lr.status); }
    const data = await lr.json();
    const labels = (data.labels || []).map(l => ({
      id: l.id, name: FRIENDLY_NAMES[l.id] || l.name, type: l.type,
      messagesTotal: l.messagesTotal || 0, messagesUnread: l.messagesUnread || 0,
    }));
    const system = labels.filter(l => l.type === 'system' && SYSTEM_ORDER.includes(l.id))
      .sort((a, b) => SYSTEM_ORDER.indexOf(a.id) - SYSTEM_ORDER.indexOf(b.id));
    const user = labels.filter(l => l.type === 'user').sort((a, b) => a.name.localeCompare(b.name));
    return res.status(200).json({ labels: [...system, ...user] });
  } catch (err) { return res.status(500).json({ error: err.message }); }
}

async function handleTrash(req, res) {
  const { messageId } = req.body;
  if (!messageId) return res.status(400).json({ error: 'Missing messageId' });
  try {
    const token = await getAccessToken();
    const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message || r.status); }
    return res.status(200).json({ ok: true });
  } catch (err) { return res.status(500).json({ error: err.message }); }
}

async function handleDelete(req, res) {
  const { messageId } = req.body;
  if (!messageId) return res.status(400).json({ error: 'Missing messageId' });
  try {
    const token = await getAccessToken();
    const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok && r.status !== 204) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message || r.status); }
    return res.status(200).json({ ok: true });
  } catch (err) { return res.status(500).json({ error: err.message }); }
}

async function handleArchive(req, res) {
  const { messageId } = req.body;
  if (!messageId) return res.status(400).json({ error: 'Missing messageId' });
  try {
    const token = await getAccessToken();
    const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeLabelIds: ['INBOX'] }) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message || r.status); }
    return res.status(200).json({ ok: true });
  } catch (err) { return res.status(500).json({ error: err.message }); }
}

async function handleMove(req, res) {
  const { messageId, addLabelIds, removeLabelIds } = req.body;
  if (!messageId) return res.status(400).json({ error: 'Missing messageId' });
  try {
    const token = await getAccessToken();
    const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ addLabelIds: addLabelIds || [], removeLabelIds: removeLabelIds || [] }) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message || r.status); }
    return res.status(200).json({ ok: true });
  } catch (err) { return res.status(500).json({ error: err.message }); }
}

async function handleMarkRead(req, res) {
  const { messageId, read } = req.body;
  if (!messageId) return res.status(400).json({ error: 'Missing messageId' });
  try {
    const token = await getAccessToken();
    const body = read ? { removeLabelIds: ['UNREAD'] } : { addLabelIds: ['UNREAD'] };
    const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message || r.status); }
    return res.status(200).json({ ok: true });
  } catch (err) { return res.status(500).json({ error: err.message }); }
}

async function handleSend(req, res) {
  const { to, subject, body, threadId, inReplyTo, references } = req.body;
  if (!to || !body) return res.status(400).json({ error: 'Missing to or body' });
  try {
    const token = await getAccessToken();
    const from = process.env.GMAIL_USER || 'double6lets@gmail.com';
    let mime = `From: ${from}\r\nTo: ${to}\r\nSubject: ${subject || ''}\r\nContent-Type: text/plain; charset=UTF-8\r\n`;
    if (inReplyTo) mime += `In-Reply-To: ${inReplyTo}\r\n`;
    if (references) mime += `References: ${references}\r\n`;
    mime += `\r\n${body}`;
    const encoded = Buffer.from(mime).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const payload = { raw: encoded };
    if (threadId) payload.threadId = threadId;
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message || r.status); }
    const data = await r.json();
    return res.status(200).json({ ok: true, messageId: data.id });
  } catch (err) { return res.status(500).json({ error: err.message }); }
}

async function handleSaveDraft(req, res) {
  const { draftId, to, subject, body, threadId } = req.body;
  const from = process.env.GMAIL_USER || 'double6lets@gmail.com';
  try {
    const token = await getAccessToken();
    let mime = `From: ${from}\r\n`;
    if (to) mime += `To: ${to}\r\n`;
    mime += `Subject: ${subject || ''}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${body || ''}`;
    const encoded = Buffer.from(mime).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const message = { raw: encoded };
    if (threadId) message.threadId = threadId;
    const url = draftId
      ? `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${draftId}`
      : 'https://gmail.googleapis.com/gmail/v1/users/me/drafts';
    const method = draftId ? 'PUT' : 'POST';
    const r = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message || r.status); }
    const data = await r.json();
    return res.status(200).json({ ok: true, draftId: data.id });
  } catch (err) { return res.status(500).json({ error: err.message }); }
}
