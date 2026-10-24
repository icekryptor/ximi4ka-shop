import { expectTypeOf, test } from 'vitest'
import type {
  AccountMaterial,
  MaterialKind,
  PublicOrderMaterial,
  PublicOrderStatus,
} from '../index.js'

test('MaterialKind — файл или внешняя ссылка', () => {
  expectTypeOf<MaterialKind>().toEqualTypeOf<'file' | 'link'>()
})

test('PublicOrderMaterial не содержит путей к файлам', () => {
  expectTypeOf<keyof PublicOrderMaterial>().toEqualTypeOf<'id' | 'title' | 'kind' | 'url'>()
})

test('PublicOrderStatus.materials — необязательный список материалов заказа', () => {
  expectTypeOf<PublicOrderStatus['materials']>().toEqualTypeOf<PublicOrderMaterial[] | undefined>()
})

test('AccountMaterial: дата выдачи — строка ISO', () => {
  expectTypeOf<AccountMaterial['grantedAt']>().toEqualTypeOf<string>()
})
