// Accept any JSON-serialisable object or array. Using `unknown` keeps the
// helper typed without forcing every JSON-LD shape to carry an index signature.
interface Props {
  data: unknown
}

// JSON.stringify не экранирует `</script>`: строка с ним в тексте, который
// вносит редактор (вопрос FAQ, заголовок, описание), закрыла бы тег и
// выполнила чужой скрипт у каждого посетителя страницы, включая админа.
// Заменяем < > & и разделители строк U+2028/U+2029 на \\u-последовательности:
// для JSON это те же символы, а для HTML-парсера в них нет ни тега, ни комментария.
function safeJson(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(new RegExp(String.fromCharCode(0x2028), 'g'), '\\u2028')
    .replace(new RegExp(String.fromCharCode(0x2029), 'g'), '\\u2029')
}

/**
 * Injects a JSON-LD script tag. Pass either a single object or an array of
 * schema.org objects — arrays are stringified as one `application/ld+json`
 * block, which Google and Yandex both accept.
 */
export function JsonLd({ data }: Props) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJson(data) }} />
}
