import { getFreeAgentBaseUrl } from './_lib/freeagent-auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const clientId = process.env.FREEAGENT_CLIENT_ID;
  const clientSecret = process.env.FREEAGENT_CLIENT_SECRET;
  const baseUrl = getFreeAgentBaseUrl();
  const redirectUri = `https://${req.headers.host}/api/freeagent-auth`;
  const isSandbox = process.env.FREEAGENT_SANDBOX === 'true';

  const { code } = req.query;

  // Step 2: Exchange auth code for tokens
  if (code) {
    try {
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const tokenRes = await fetch(`${baseUrl}/v2/token_endpoint`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
      });

      const data = await tokenRes.json();

      if (data.error) {
        return res.status(400).send(page(`
          <h2 style="color:#e11d48">Error</h2>
          <p><strong>${data.error}</strong>: ${data.error_description || ''}</p>
          <a href="/api/freeagent-auth" class="btn">Try Again</a>
        `));
      }

      if (!data.refresh_token) {
        return res.status(200).send(page(`
          <h2 style="color:#d97706">No Refresh Token</h2>
          <p>FreeAgent didn't return a refresh token. This can happen if the app was previously authorized.</p>
          <p>Try revoking access in FreeAgent settings, then authorize again.</p>
          <a href="/api/freeagent-auth" class="btn">Try Again</a>
          <details style="margin-top:16px"><summary>Full response</summary><pre>${JSON.stringify(data, null, 2)}</pre></details>
        `));
      }

      return res.status(200).send(page(`
        <h2 style="color:#10b981">Success!</h2>
        <p>Copy this refresh token and add it as <code>FREEAGENT_REFRESH_TOKEN</code> in your Vercel environment variables:</p>
        <div style="background:#f1f1f5;border:1px solid #e4e4ea;border-radius:8px;padding:12px 16px;word-break:break-all;font-family:monospace;font-size:13px;margin:12px 0;user-select:all">${data.refresh_token}</div>
        <p style="font-size:13px;color:#6b7080">After adding the env var, redeploy your app.</p>
        ${isSandbox ? '<p style="color:#d97706;font-size:13px"><strong>Sandbox mode</strong> — using test environment</p>' : ''}
      `));
    } catch (err) {
      return res.status(500).send(page(`
        <h2 style="color:#e11d48">Server Error</h2>
        <p>${err.message}</p>
        <a href="/api/freeagent-auth" class="btn">Try Again</a>
      `));
    }
  }

  // Step 1: Show auth link
  if (!clientId) {
    return res.status(500).send(page(`
      <h2 style="color:#e11d48">Missing Config</h2>
      <p><code>FREEAGENT_CLIENT_ID</code> is not set in Vercel environment variables.</p>
      <p>Register your app at <a href="https://dev.freeagent.com" target="_blank">dev.freeagent.com</a>, then add the credentials.</p>
    `));
  }

  const authUrl = `${baseUrl}/v2/approve_app?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;

  return res.status(200).send(page(`
    <h2>FreeAgent Setup</h2>
    <p>Connect your FreeAgent account to push expenses, bills, and invoices directly from Double Six Lets.</p>
    ${isSandbox ? '<p style="color:#d97706;font-size:13px;margin-bottom:8px"><strong>Sandbox mode</strong> — connecting to test environment</p>' : ''}
    <a href="${authUrl}" class="btn">Connect FreeAgent</a>
    <div style="margin-top:20px;padding:14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;font-size:13px">
      <strong>Setup checklist:</strong>
      <ol style="margin-top:8px;padding-left:20px;line-height:1.8;color:#6b7080">
        <li>Register app at <a href="https://dev.freeagent.com" target="_blank">dev.freeagent.com</a></li>
        <li>Set redirect URI to: <code>${redirectUri}</code></li>
        <li>Add <code>FREEAGENT_CLIENT_ID</code> and <code>FREEAGENT_CLIENT_SECRET</code> to Vercel</li>
        <li>Click "Connect FreeAgent" above</li>
        <li>Copy refresh token → add as <code>FREEAGENT_REFRESH_TOKEN</code></li>
        <li>Redeploy</li>
      </ol>
    </div>
  `));
}

function page(body) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Double Six Lets - FreeAgent Setup</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'DM Sans',sans-serif;background:#f8f8fa;color:#1a1a2e;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.card{background:#fff;border-radius:16px;box-shadow:0 2px 20px rgba(0,0,0,.06);padding:32px;max-width:520px;width:100%}h2{font-size:20px;margin-bottom:12px}p{font-size:14px;color:#6b7080;line-height:1.6;margin-bottom:12px}code{background:#f1f1f5;padding:2px 6px;border-radius:4px;font-size:12px}.btn{display:inline-block;background:#00856a;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:500;font-size:14px;margin-top:8px;transition:background .2s}.btn:hover{background:#006b55}pre{font-size:12px;overflow-x:auto;margin-top:8px;padding:8px;background:#f8f8fa;border-radius:6px}details{cursor:pointer}summary{font-weight:500}ol{color:#6b7080}</style>
</head><body><div class="card">${body}</div></body></html>`;
}
