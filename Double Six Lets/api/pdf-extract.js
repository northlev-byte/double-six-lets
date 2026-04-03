import { getAccessToken } from './_lib/google-auth.js';
import pdf from 'pdf-parse/lib/pdf-parse.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messageId, attachmentId } = req.query;
  if (!messageId || !attachmentId) {
    return res.status(400).json({ error: 'Missing messageId or attachmentId' });
  }

  try {
    const token = await getAccessToken();

    // Download the attachment from Gmail
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

    // Parse PDF and extract text
    const parsed = await pdf(buffer);
    const text = parsed.text || '';

    return res.status(200).json({
      text: text.substring(0, 5000), // Cap at 5000 chars for the AI prompt
      pages: parsed.numpages || 0,
      info: parsed.info || {},
    });
  } catch (err) {
    console.error('PDF extract error:', err);
    return res.status(500).json({ error: err.message });
  }
}
