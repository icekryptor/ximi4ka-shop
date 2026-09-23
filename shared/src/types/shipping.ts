// Коробки, в которых магазин отправляет заказы (размеры — от владельца,
// 23.09.2026). Наборы едут в своих коробках, мелочь раскладывается по
// количеству предметов: малая — до 5, средняя — до 15, большая — больше.
export type ShippingBox = 'small' | 'medium' | 'elektro' | 'large'

// Одно место отправления СДЭК. Вес — в граммах, габариты — в сантиметрах,
// как их ждёт API и виджет.
export interface ShippingPackage {
  box: ShippingBox
  weightG: number
  lengthCm: number
  widthCm: number
  heightCm: number
  // Вес хотя бы одного товара неизвестен и взят по умолчанию.
  estimated: boolean
  items: { productId: string; quantity: number }[]
}
