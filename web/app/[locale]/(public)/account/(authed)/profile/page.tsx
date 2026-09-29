import { redirect } from 'next/navigation'

// Личные данные переехали на главную страницу кабинета (/account) —
// старые ссылки и закладки ведут туда.
export default function AccountProfileRedirect() {
  redirect('/account')
}
