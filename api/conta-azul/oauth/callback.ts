import crypto from 'node:crypto';
import { getBaseUrl, getSupabaseAdmin, json } from '../../../shared/conta-azul-server';

const TOKEN_URL = 'https://api.contaazul.com/oauth2/token';

const verifyState = (state: string, secret: string) => {
  const [nonce, signature] = state.split('.');
  if (!nonce || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(nonce).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method Not Allowed' });

  const code = req.query?.code as string | undefined;
  const state = req.query?.state as string | undefined;

  const clientId = process.env.CONTA_AZUL_CLIENT_ID;
  const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return json(res, 500, { error: 'Conta Azul não configurado.' });
  }

  if (!code || !state || !verifyState(state, clientSecret)) {
    return json(res, 400, { error: 'Estado OAuth inválido.' });
  }

  const redirectUri =
    process.env.CONTA_AZUL_REDIRECT_URI ||
    `${getBaseUrl(req)}/api/conta-azul/oauth/callback`;

  try {
    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Erro ao obter tokens.');
    }

    const payload = await response.json();
    const accessToken = payload.access_token as string | undefined;
    const refreshToken = payload.refresh_token as string | undefined;
    const expiresIn = Number(payload.expires_in ?? 0);

    if (!accessToken || !refreshToken) {
      throw new Error('Tokens inválidos retornados pela Conta Azul.');
    }

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const supabaseAdmin = getSupabaseAdmin();

    const { error } = await supabaseAdmin
      .from('conta_azul_tokens')
      .upsert(
        {
          id: 1,
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: expiresAt,
        },
        { onConflict: 'id' }
      );

    if (error) throw error;

    res.statusCode = 302;
    res.setHeader('Location', '/configuracoes?contaazul=connected');
    res.end();
  } catch (error: any) {
    return json(res, 500, { error: error?.message || 'Falha ao conectar Conta Azul.' });
  }
}
