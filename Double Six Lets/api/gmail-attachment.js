import { getAccessToken } from './_lib/google-auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messageId, attachmentId, filename } = req.query;
  if (!messageId || !attachmentId) {
    return res.status(400).json({ error: 'Missing messageId or attachmentId' });
  }

  try {
    const token = await getAccessToken();

    const attRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!attRes.ok) {
      const err = await attRes.json().catch(() => ({}));
      throw new Error(err.error?.message || `Attachment fetch failed: ${attRes.status}`);
    }

    const data = await attRes.json();
    const buffer = Buffer.from(data.data, 'base64url');

    // Determine content type from filename
    const ext = (filename || '').toLowerCase().split('.').pop();
    const mimeTypes = {
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      csv: 'text/csv',
      txt: 'text/plain',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${filename || 'attachment'}"`);
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (err) {
    console.error('Attachment error:', err);
    return res.status(500).json({ error: err.message });
  }
}
