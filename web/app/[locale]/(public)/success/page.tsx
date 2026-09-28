import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { paymentReturnPath } from '@/lib/paymentReturn'

export const metadata: Metadata = { robots: { index: false, follow: false } }

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

// Т-Банк возвращает сюда покупателя по TBANK_SUCCESS_URL — переадресуем на страницу заказа.
export default async function PaymentSuccessPage({ searchParams }: Props) {
  redirect(paymentReturnPath(await searchParams, 'success'))
}
