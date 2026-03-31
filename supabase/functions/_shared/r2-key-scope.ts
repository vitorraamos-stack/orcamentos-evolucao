const KEY_CONTROL_CHAR_REGEX = /[\x00-\x1F\x7F]/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const validateR2ScopedKey = (
  key: unknown,
  allowedPrefixes = ['os_orders/'],
): { ok: true; value: string } | { ok: false; message: string } => {
  if (typeof key !== 'string') {
    return { ok: false, message: 'A chave do objeto deve ser string.' };
  }

  const value = key.trim();
  if (value.length === 0 || value.length > 1024) {
    return { ok: false, message: 'A chave do objeto é obrigatória e deve ter até 1024 caracteres.' };
  }

  if (value !== key) {
    return { ok: false, message: 'A chave do objeto não pode conter espaços extras no início/fim.' };
  }

  if (!allowedPrefixes.some((prefix) => value.startsWith(prefix))) {
    return { ok: false, message: 'Prefixo de chave não permitido.' };
  }

  if (value.includes('..')) {
    return { ok: false, message: 'A chave do objeto não pode conter ..' };
  }

  if (KEY_CONTROL_CHAR_REGEX.test(value)) {
    return { ok: false, message: 'A chave do objeto contém caracteres de controle inválidos.' };
  }

  if (value.includes('\\') || value.includes('//') || value.endsWith('/') || value.startsWith('/')) {
    return { ok: false, message: 'A chave do objeto possui path malformado.' };
  }

  const segments = value.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    return { ok: false, message: 'A chave do objeto possui segmentos inválidos.' };
  }

  if (segments.length < 3) {
    return { ok: false, message: 'A chave do objeto deve seguir o padrão os_orders/<os_id>/... .' };
  }

  if (segments[0] !== 'os_orders') {
    return { ok: false, message: 'A chave do objeto deve iniciar com os_orders/.' };
  }

  if (!UUID_REGEX.test(segments[1])) {
    return { ok: false, message: 'A chave do objeto deve conter o id da OS em formato UUID no segundo segmento.' };
  }

  return { ok: true, value };
};

export const extractOrderIdFromR2ScopedKey = (key: string): string => key.split('/')[1];

export const isValidOrderId = (orderId: string) => UUID_REGEX.test(orderId);
