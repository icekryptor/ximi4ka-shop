import { MoleculeMotifLJ } from '@/components/decor/MoleculeMotif.lj'
interface Props { variant?: 'water' | 'methane' }
export function HeroDetailMolecule({ variant = 'water' }: Props) {
  return (
    <div
      aria-hidden="true"
      className="absolute top-[5.5rem] right-12 z-[2] opacity-55 pointer-events-none"
      style={{ width: 110, height: 60 }}
    >
      <MoleculeMotifLJ variant={variant} className="w-[110px] h-[60px] text-[var(--color-lj-ink)]" />
    </div>
  )
}
