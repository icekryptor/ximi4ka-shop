// Ambient type declarations for amphtml-validator.
//
// The upstream package ships only JS and no @types package exists. We only
// touch `getInstance().validateString()` in tests, so a minimal surface is
// enough — anything missing falls through to `unknown` at the call site
// which is safer than `any`.

declare module 'amphtml-validator' {
  export interface ValidationError {
    severity: 'ERROR' | 'WARNING'
    line?: number
    col?: number
    message?: string
    specUrl?: string
    code: string
    params: string[]
  }

  export interface ValidationResult {
    status: 'PASS' | 'FAIL' | 'UNKNOWN'
    errors: ValidationError[]
  }

  export interface Validator {
    validateString(html: string, htmlFormat?: string): ValidationResult
  }

  export function getInstance(validatorJs?: string): Promise<Validator>

  const amphtmlValidator: {
    getInstance: typeof getInstance
  }
  export default amphtmlValidator
}
