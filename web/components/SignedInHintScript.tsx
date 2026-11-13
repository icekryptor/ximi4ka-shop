import { SIGNED_IN_SCRIPT } from '@/lib/signedInHint'

// Статичный инлайн-скрипт без данных запроса: страница остаётся кешируемой (ISR).
export function SignedInHintScript() {
  return <script dangerouslySetInnerHTML={{ __html: SIGNED_IN_SCRIPT }} />
}
