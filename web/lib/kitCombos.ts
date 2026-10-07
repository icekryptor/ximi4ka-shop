// Комбо наборов и состав. Состав — по коробкам в
// api/src/seeds/_lib/tilda-shipping.ts: комбо едет теми же коробками, что
// входящие в него наборы. Если состав комбо изменится, правьте здесь.
export interface KitCombo {
  slug: string
  /** Слаги наборов, из которых состоит комбо. */
  components: readonly string[]
}

/** От большего комбо к меньшему: при равной выгоде выигрывает первое в списке. */
export const KIT_COMBOS: readonly KitCombo[] = [
  {
    slug: 'vse-chetyre-nabora',
    components: ['himichka-30', 'elektrohimichka', 'mini-himichka', 'bolshoi-nabor-dlya-oge'],
  },
  {
    slug: 'vse-tri-nabora',
    components: ['himichka-30', 'elektrohimichka', 'mini-himichka'],
  },
  {
    slug: 'himichka-i-elektrohimichka',
    components: ['himichka-30', 'elektrohimichka'],
  },
]
