import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Tests share a single Postgres database; running files in parallel causes
    // TRUNCATE from one suite to wipe rows mid-test in another. Serialize.
    fileParallelism: false,
    // Creates the isolated test database (TEST_DATABASE_URL, default
    // ximi4ka_shop_test) and runs migrations. Tests never touch DATABASE_URL.
    globalSetup: ['src/test/globalSetup.ts'],
    // Все запросы тестов идут с одного IP: лимиты входа и заказа в проде
    // (10 и 20) их бы заблокировали. 1000 — потолок envLimit в app.ts. Тесты самих лимитов ставят низкие значения
    // через vi.stubEnv (см. routes/abuse-protection.test.ts).
    env: { LOGIN_RATE_LIMIT: '1000', CHECKOUT_RATE_LIMIT: '1000' },
  },
})
