// Accept any JSON-serialisable object or array. Using `unknown` keeps the
// helper typed without forcing every JSON-LD shape to carry an index signature.
interface Props {
  data: unknown
}

/**
 * Injects a JSON-LD script tag. Pass either a single object or an array of
 * schema.org objects — arrays are stringified as one `application/ld+json`
 * block, which Google and Yandex both accept.
 */
export function JsonLd({ data }: Props) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}
