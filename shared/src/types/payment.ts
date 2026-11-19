// Надбавка за оплату через CloudPayments (Visa / Mastercard банков стран ЕАЭС).
// Процент задаёт админка (SiteSettings.cloudpaymentsSurchargePercent, по умолчанию 0),
// считает сервер; витрина зовёт ту же функцию только для показа.
// База — сумма к оплате без самой надбавки: товары − скидки − промокод + доставка.
// Без runtime-импортов: Turbopack не резолвит ./x.js внутри shared.

export const MAX_PAYMENT_SURCHARGE_PERCENT = 15

export function paymentSurchargeRub(baseRub: number, percent: number): number {
  if (!Number.isFinite(baseRub) || baseRub <= 0) return 0
  if (!Number.isInteger(percent) || percent <= 0) return 0
  return Math.round((baseRub * Math.min(percent, MAX_PAYMENT_SURCHARGE_PERCENT)) / 100)
}
