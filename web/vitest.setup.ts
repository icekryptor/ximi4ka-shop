import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// With vitest's globals: false, @testing-library/react doesn't auto-register
// its afterEach cleanup. Unmount rendered components between tests or
// getBy* queries see duplicates from the previous case.
afterEach(() => {
  cleanup()
})
