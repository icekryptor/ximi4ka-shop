// Вход через ximi4ka ID (спека 2026-09-29-ximi4ka-id-sso-design.md): api
// отправляет не вошедшего на /account/login?next=/api/account/sso/authorize?…
// По next страница входа понимает, что человек пришёл с другого нашего сайта,
// и говорит, куда его вернут.
const SSO_CLIENT_LABELS: Record<string, string> = {
  learn: 'XimiLearn',
}

export function ssoClientLabel(next: string): string | null {
  if (!next.startsWith('/api/account/sso/authorize?')) return null
  const clientId = new URLSearchParams(next.slice(next.indexOf('?') + 1)).get('client_id')
  return (clientId && SSO_CLIENT_LABELS[clientId]) || null
}
