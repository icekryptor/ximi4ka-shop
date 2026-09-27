// Возврат покупателя из Т-Банка на /success и /fail — запасной путь для
// старых платёжных ссылок и настройки TBANK_SUCCESS_URL/FAIL_URL (новые
// ссылки ведут сразу на страницу заказа с секретом, см. api tbank.ts).
// Банк дописывает к адресу OrderId — это номер заказа. Принимаем только
// наш формат номера, чтобы не превратить страницу в открытый редирект.
const ORDER_NUMBER_RE = /^XM-\d{4}-\d{1,10}$/

export function paymentReturnPath(
  searchParams: { [key: string]: string | string[] | undefined },
  outcome: 'success' | 'fail',
): string {
  const raw = searchParams.OrderId
  const orderId = typeof raw === 'string' ? raw.trim() : ''
  if (!ORDER_NUMBER_RE.test(orderId)) return '/orders/track'
  return outcome === 'success' ? `/order/${orderId}?new=1` : `/order/${orderId}?payment=failed`
}
