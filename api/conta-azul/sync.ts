import { getSupabaseAdmin, json, requireAdminAuth } from '../../shared/conta-azul-server';

const API_BASE_URL = 'https://api.contaazul.com/v1';
const TOKEN_URL = 'https://api.contaazul.com/oauth2/token';
const DEFAULT_SYNC_WINDOW_DAYS = 2;

const toDateString = (value?: string | null) => (value ? value.slice(0, 10) : null);

const formatItemLine = (item: any) => {
  const quantity = item.quantidade ?? item.quantity ?? item.qtd ?? 1;
  const description = item.descricao ?? item.description ?? item.nome ?? item.name ?? 'Item';
  const notes = item.observacoes ?? item.observation ?? item.obs ?? '';
  const suffix = notes ? ` — ${notes}` : '';
  return `- ${quantity}x ${description}${suffix}`;
};

const fetchJson = async (url: string, options: RequestInit) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Erro na Conta Azul (${response.status}).`);
  }
  return response.json();
};

const refreshToken = async (refreshTokenValue: string) => {
  const clientId = process.env.CONTA_AZUL_CLIENT_ID;
  const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Conta Azul não configurado.');
  }

  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshTokenValue,
  });

  return fetchJson(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
};

const fetchSales = async (accessToken: string, start: string, end: string) => {
  const params = new URLSearchParams({
    dataInicial: start,
    dataFinal: end,
    tipo: 'VENDA',
    situacao: 'CONFIRMADO',
  });

  return fetchJson(`${API_BASE_URL}/venda/busca?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
};

const fetchSaleItems = async (accessToken: string, saleId: string) => {
  return fetchJson(`${API_BASE_URL}/venda/${saleId}/itens`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
};

export default async function handler(req: any, res: any) {
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Method Not Allowed' });

  const cronSecret = req.headers?.['x-cron-secret'] as string | undefined;
  const expectedCronSecret = process.env.CONTA_AZUL_CRON_SECRET;

  if (!cronSecret || !expectedCronSecret || cronSecret !== expectedCronSecret) {
    const authResult = await requireAdminAuth(req);
    if (!authResult.ok) return json(res, authResult.status, { error: authResult.error });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const now = new Date();

  let lastError: string | null = null;
  let importedCount = 0;

  try {
    const { data: tokenRow, error: tokenError } = await supabaseAdmin
      .from('conta_azul_tokens')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (tokenError) throw tokenError;
    if (!tokenRow?.access_token) {
      throw new Error('Conta Azul não está conectado.');
    }

    let accessToken = tokenRow.access_token as string;
    let refreshTokenValue = tokenRow.refresh_token as string;

    if (new Date(tokenRow.expires_at).getTime() <= Date.now() + 60_000) {
      const refreshed = await refreshToken(refreshTokenValue);
      accessToken = refreshed.access_token;
      refreshTokenValue = refreshed.refresh_token ?? refreshTokenValue;
      const expiresAt = new Date(Date.now() + Number(refreshed.expires_in ?? 0) * 1000).toISOString();

      const { error: updateError } = await supabaseAdmin
        .from('conta_azul_tokens')
        .update({ access_token: accessToken, refresh_token: refreshTokenValue, expires_at: expiresAt })
        .eq('id', 1);

      if (updateError) throw updateError;
    }

    const { data: syncState } = await supabaseAdmin
      .from('conta_azul_sync_state')
      .select('last_sync_at')
      .eq('id', 1)
      .maybeSingle();

    const startDate = syncState?.last_sync_at
      ? new Date(syncState.last_sync_at)
      : new Date(now.getTime() - DEFAULT_SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const startParam = startDate.toISOString().slice(0, 10);
    const endParam = now.toISOString().slice(0, 10);

    const salesResponse = await fetchSales(accessToken, startParam, endParam);
    const sales = (salesResponse?.vendas || salesResponse?.data || salesResponse || []) as any[];

    const saleIds = sales.map((sale) => String(sale.id || sale.venda_id || sale.sale_id)).filter(Boolean);
    const { data: imported } = await supabaseAdmin
      .from('conta_azul_sales_imports')
      .select('venda_id')
      .in('venda_id', saleIds.length ? saleIds : ['__none__']);

    const importedIds = new Set(imported?.map((row) => row.venda_id) ?? []);

    for (const sale of sales) {
      const saleId = String(sale.id || sale.venda_id || sale.sale_id || '');
      if (!saleId || importedIds.has(saleId)) continue;

      const status = (sale.status || sale.situacao || '').toString().toLowerCase();
      if (status && !['confirmado', 'confirmada', 'fechado', 'aprovado'].includes(status)) {
        continue;
      }

      const customerName =
        sale.cliente?.nome ||
        sale.client?.name ||
        sale.cliente_nome ||
        sale.customer_name ||
        'Cliente';

      const saleNumber = sale.numero || sale.sale_number || sale.numero_venda || saleId;

      const itemsResponse = await fetchSaleItems(accessToken, saleId);
      const items = (itemsResponse?.itens || itemsResponse?.data || itemsResponse || []) as any[];
      const itemsLines = items.map(formatItemLine);
      const deliveryDate =
        sale.data_compromisso ||
        sale.data_entrega ||
        sale.delivery_date ||
        sale.dataEntrega ||
        null;

      const descriptionParts = [
        'Itens:',
        itemsLines.length ? itemsLines.join('\n') : '- Sem itens detalhados',
        '',
        `Data de entrega: ${deliveryDate ? toDateString(deliveryDate) : '-'}`,
      ];

      const { data: createdOrder, error: createError } = await supabaseAdmin
        .from('os_orders')
        .insert({
          sale_number: String(saleNumber),
          client_name: String(customerName),
          description: descriptionParts.join('\n'),
          delivery_date: toDateString(deliveryDate),
          logistic_type: 'retirada',
          art_status: 'Caixa de Entrada',
          prod_status: null,
          external_source: 'conta_azul',
          external_id: saleId,
        })
        .select('id')
        .single();

      if (createError) throw createError;

      const { error: importError } = await supabaseAdmin
        .from('conta_azul_sales_imports')
        .insert({
          venda_id: saleId,
          venda_numero: String(saleNumber),
          cliente_nome: String(customerName),
          hub_os_card_id: createdOrder?.id ?? null,
        });

      if (importError) throw importError;
      importedCount += 1;
    }

    await supabaseAdmin.from('conta_azul_sync_state').upsert(
      {
        id: 1,
        last_sync_at: now.toISOString(),
        last_success_at: now.toISOString(),
        last_error: null,
      },
      { onConflict: 'id' }
    );

    return json(res, 200, { ok: true, imported: importedCount });
  } catch (error: any) {
    lastError = error?.message || 'Erro ao sincronizar.';
    await supabaseAdmin.from('conta_azul_sync_state').upsert(
      {
        id: 1,
        last_sync_at: now.toISOString(),
        last_error: lastError,
      },
      { onConflict: 'id' }
    );
    return json(res, 500, { error: lastError });
  }
}
