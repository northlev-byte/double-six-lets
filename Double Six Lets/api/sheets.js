import { getAccessToken } from './_lib/google-auth.js';

const SHEET_HEADERS = ['Date', 'Type', 'Category', 'Description', 'Amount (\u00a3)', 'VAT (\u00a3)', 'Net (\u00a3)', 'Property', 'From', 'Subject', 'Status', 'Logged At'];
const SHEET_TABS = ['All Transactions', '39 Esher Road', '49 Greene Way', '105 Ladywell'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = await getAccessToken();
    const { action, spreadsheetId, data } = req.body;

    if (action === 'ensure') {
      return await handleEnsure(token, spreadsheetId, res);
    } else if (action === 'log') {
      return await handleLog(token, spreadsheetId, data, res);
    } else {
      return res.status(400).json({ error: 'Invalid action. Use "ensure" or "log".' });
    }
  } catch (err) {
    console.error('Sheets error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function handleEnsure(token, existingId, res) {
  // If an ID was provided, verify it exists
  if (existingId) {
    try {
      const check = await sheetsApi(token, `https://sheets.googleapis.com/v4/spreadsheets/${existingId}?fields=spreadsheetId`, 'GET');
      if (check.spreadsheetId) {
        return res.status(200).json({ spreadsheetId: check.spreadsheetId });
      }
    } catch {
      // Sheet doesn't exist or no access — create a new one
    }
  }

  // Create new spreadsheet
  const createRes = await sheetsApi(token, 'https://sheets.googleapis.com/v4/spreadsheets', 'POST', {
    properties: { title: 'Double Six Lets \u2014 Finance Tracker' },
    sheets: SHEET_TABS.map((t, i) => ({ properties: { sheetId: i, title: t, index: i } })),
  });

  const spreadsheetId = createRes.spreadsheetId;

  // Write headers to each tab
  for (const tab of SHEET_TABS) {
    await sheetsApi(
      token,
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("'" + tab + "'!A1")}?valueInputOption=USER_ENTERED`,
      'PUT',
      { values: [SHEET_HEADERS] }
    );
  }

  // Format headers — bold + dark bg + orange text
  await sheetsApi(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    'POST',
    {
      requests: SHEET_TABS.map((_, i) => ({
        repeatCell: {
          range: {
            sheetId: i,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: SHEET_HEADERS.length,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.16, green: 0.16, blue: 0.16 },
              textFormat: {
                bold: true,
                foregroundColor: { red: 0.98, green: 0.45, blue: 0.09 },
              },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)',
        },
      })),
    }
  );

  return res.status(200).json({ spreadsheetId });
}

async function handleLog(token, spreadsheetId, data, res) {
  if (!spreadsheetId) {
    return res.status(400).json({ error: 'Missing spreadsheetId' });
  }
  if (!data?.row || !data?.tabs) {
    return res.status(400).json({ error: 'Missing data.row or data.tabs' });
  }

  for (const tab of data.tabs) {
    await sheetsApi(
      token,
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("'" + tab + "'!A:A")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      'POST',
      { values: [data.row] }
    );
  }

  return res.status(200).json({ ok: true });
}

async function sheetsApi(token, url, method, body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Sheets API error: ${res.status}`);
  }

  return res.json().catch(() => ({}));
}
