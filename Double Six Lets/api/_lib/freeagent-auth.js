let cachedToken = null;
let tokenExpiry = 0;

export function getFreeAgentBaseUrl() {
  return process.env.FREEAGENT_SANDBOX === 'true'
    ? 'https://api.sandbox.freeagent.com'
    : 'https://api.freeagent.com';
}

export async function getFreeAgentToken() {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const { FREEAGENT_CLIENT_ID, FREEAGENT_CLIENT_SECRET, FREEAGENT_REFRESH_TOKEN } = process.env;

  if (!FREEAGENT_CLIENT_ID || !FREEAGENT_CLIENT_SECRET || !FREEAGENT_REFRESH_TOKEN) {
    throw new Error('Missing FreeAgent credentials in environment variables');
  }

  const baseUrl = getFreeAgentBaseUrl();

  // FreeAgent uses HTTP Basic Auth for token exchange
  const basicAuth = Buffer.from(`${FREEAGENT_CLIENT_ID}:${FREEAGENT_CLIENT_SECRET}`).toString('base64');

  const res = await fetch(`${baseUrl}/v2/token_endpoint`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: FREEAGENT_REFRESH_TOKEN,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`FreeAgent token refresh failed: ${err.error || res.status}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

export async function freeAgentApi(path, method = 'GET', body = null) {
  const token = await getFreeAgentToken();
  const baseUrl = getFreeAgentBaseUrl();

  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'DoubleSixLets/1.0',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${baseUrl}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `FreeAgent API error: ${res.status}`);
  }
  return res.json();
}
