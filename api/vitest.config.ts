import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Tests share a single Postgres database; running files in parallel causes
    // TRUNCATE from one suite to wipe rows mid-test in another. Serialize.
    fileParallelism: false,
    // Creates the isolated test database (TEST_DATABASE_URL, default
    // ximi4ka_shop_test) and runs migrations. Tests never touch DATABASE_URL.
    globalSetup: ['src/test/globalSetup.ts'],
  },
})
