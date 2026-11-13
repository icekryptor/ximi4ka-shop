import { deliveryProblemLabel } from './orderUi'

// Компактная отметка в списке заказов: СДЭК сообщил о проблеме с вручением.
export function DeliveryProblemBadge({ problem }: { problem: string | null | undefined }) {
  const label = deliveryProblemLabel(problem)
  if (!label) return null
  return (
    <span className="ml-2 inline-block text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
      {label}
    </span>
  )
}
