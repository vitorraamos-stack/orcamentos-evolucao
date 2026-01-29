import crypto from 'node:crypto';
import { getBaseUrl, json, requireAdminAuth } from '../../../shared/conta-azul-server';

const AUTH_BASE_URL = 'https://api.contaazul.com/oauth2/authorize';

const signState = (value: string, secret: string) =>
  crypto.createHmac('sha256', secret).update(value).digest('hex');

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method Not Allowed' });

  const authResult = await requireAdminAuth(req);
  if (!authResult.ok) return json(res, authResult.status, { error: authResult.error });

  const clientId = process.env.CONTA_AZUL_CLIENT_ID;
  const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET;
  const scopes = process.env.CONTA_AZUL_SCOPES;

  if (!clientId || !clientSecret) {
    return json(res, 500, { error: 'Conta Azul não configurado.' });
  }

  const redirectUri =
    process.env.CONTA_AZUL_REDIRECT_URI ||
    `${getBaseUrl(req)}/api/conta-azul/oauth/callback`;

  const nonce = crypto.randomBytes(16).toString('hex');
  const signature = signState(nonce, clientSecret);
  const state = `${nonce}.${signature}`;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });

  if (scopes) {
    params.set('scope', scopes);
  }

  const authUrl = `${AUTH_BASE_URL}?${params.toString()}`;

  if (req.query?.format === 'json') {
    return json(res, 200, { url: authUrl });
  }

  res.statusCode = 302;
  res.setHeader('Location', authUrl);
  res.end();
}
