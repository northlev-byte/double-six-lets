export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const redirectUri = `https://${req.headers.host}/api/gmail-token-helper`;
  const scopes = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';

  const { code } = req.query;

  // Step 2: Exchange auth code for tokens
  if (code) {
    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code,
        }),
      });

      const data = await tokenRes.json();

      if (data.error) {
        return res.status(400).send(page(`
          <h2 style="color:#e11d48">Error</h2>
          <p><strong>${data.error}</strong>: ${data.error_description || 'Unknown error'}</p>
          <a href="/api/gmail-token-helper" class="btn">Try Again</a>
        `));
      }

      if (!data.refresh_token) {
        return res.status(200).send(page(`
          <h2 style="color:#d97706">No Refresh Token Returned</h2>
          <p>Google only returns a refresh token on the <strong>first</strong> authorization. You may need to:</p>
          <ol>
            <li>Go to <a href="https://myaccount.google.com/permissions" target="_blank">Google Account Permissions</a></li>
            <li>Remove access for "Double Six Lets" (or your app name)</li>
            <li>Try again below</li>
          </ol>
          <a href="/api/gmail-token-helper" class="btn">Try Again</a>
          <details style="margin-top:16px"><summary>Full response</summary><pre>${JSON.stringify(data, null, 2)}</pre></details>
        `));
      }

      return res.status(200).send(page(`
        <h2 style="color:#10b981">Success!</h2>
        <p>Copy this refresh token and add it as <code>GMAIL_REFRESH_TOKEN</code> in your Vercel environment variables:</p>
        <div style="background:#f1f1f5;border:1px solid #e4e4ea;border-radius:8px;padding:12px 16px;word-break:break-all;font-family:monospace;font-size:13px;margin:12px 0;user-select:all">${data.refresh_token}</div>
        <p style="font-size:13px;color:#6b7080">After adding the env var, redeploy your app.</p>
        ${data.access_token ? `<details style="margin-top:12px"><summary>Access token (expires in ${data.expires_in}s)</summary><pre style="word-break:break-all">${data.access_token}</pre></details>` : ''}
      `));
    } catch (err) {
      return res.status(500).send(page(`
        <h2 style="color:#e11d48">Server Error</h2>
        <p>${err.message}</p>
        <a href="/api/gmail-token-helper" class="btn">Try Again</a>
      `));
    }
  }

  // Step 1: Show auth link
  if (!clientId) {
    return res.status(500).send(page(`
      <h2 style="color:#e11d48">Missing Config</h2>
      <p><code>GMAIL_CLIENT_ID</code> is not set in Vercel environment variables.</p>
      <p>Add <code>GMAIL_CLIENT_ID</code> and <code>GMAIL_CLIENT_SECRET</code> first, then revisit this page.</p>
    `));
  }

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent`;

  return res.status(200).send(page(`
    <h2>Gmail Token Setup</h2>
    <p>Click below to authorize <strong>double6lets@gmail.com</strong> and get a refresh token.</p>
    <a href="${authUrl}" class="btn">Authorize with Google</a>
    <div style="margin-top:20px;padding:14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;font-size:13px">
      <strong>Important:</strong> Sign in with <code>double6lets@gmail.com</code> and grant all requested permissions (Gmail read, Spreadsheets, Drive).
    </div>
    <details style="margin-top:16px;font-size:13px;color:#6b7080">
      <summary>Setup checklist</summary>
      <ol style="margin-top:8px;padding-left:20px;line-height:1.8">
        <li>Set <code>GMAIL_CLIENT_ID</code> and <code>GMAIL_CLIENT_SECRET</code> in Vercel env vars</li>
        <li>In Google Cloud Console, add <code>${redirectUri}</code> as an authorized redirect URI</li>
        <li>If app is in "Testing" mode, add <code>double6lets@gmail.com</code> as a test user</li>
        <li>Click the authorize button above</li>
        <li>Copy the refresh token and add as <code>GMAIL_REFRESH_TOKEN</code> in Vercel</li>
        <li>Redeploy</li>
      </ol>
    </details>
  `));
}

function page(body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Double Six Lets - Gmail Token Setup</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'DM Sans',sans-serif;background:#f8f8fa;color:#1a1a2e;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#fff;border-radius:16px;box-shadow:0 2px 20px rgba(0,0,0,.06);padding:32px;max-width:520px;width:100%}
    h2{font-size:20px;margin-bottom:12px}
    p{font-size:14px;color:#6b7080;line-height:1.6;margin-bottom:12px}
    code{background:#f1f1f5;padding:2px 6px;border-radius:4px;font-size:13px}
    .btn{display:inline-block;background:#f97316;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:500;font-size:14px;margin-top:8px;transition:background .2s}
    .btn:hover{background:#ea670c}
    pre{font-size:12px;overflow-x:auto;margin-top:8px;padding:8px;background:#f8f8fa;border-radius:6px}
    details{cursor:pointer}
    summary{font-weight:500}
    ol{color:#6b7080}
  </style>
</head>
<body><div class="card">${body}</div></body>
</html>`;
}
