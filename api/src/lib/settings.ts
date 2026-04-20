import { AppDataSource } from '../config/dataSource.js'
import { SiteSettings } from '../entities/SiteSettings.js'

// The settings table is a singleton keyed by id = 'default'. The migration
// seeds that row, but this helper also handles the (paranoid) case where the
// row is missing — e.g. a database restored from a partial dump. Any path
// that needs settings should go through this helper so routes can treat the
// return value as always non-null.
export async function getSettings(): Promise<SiteSettings> {
  const repo = AppDataSource.getRepository(SiteSettings)
  let settings = await repo.findOneBy({ id: 'default' })
  if (!settings) {
    settings = await repo.save(repo.create({ id: 'default' }))
  }
  return settings
}
