import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Tests share a single Postgres database; running files in parallel causes
    // TRUNCATE from one suite to wipe rows mid-test in another. Serialize.
    fileParallelism: false,
  },
})
