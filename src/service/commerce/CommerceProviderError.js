export class CommerceProviderError extends Error {
  constructor(message, { provider, operation, status, externalCode, code, cause } = {}) {
    super(message);
    this.name = 'CommerceProviderError';
    this.provider = provider ?? null;
    this.operation = operation ?? null;
    this.status = status ?? null;
    this.externalCode = externalCode ?? code ?? null;
    /** @deprecated alias — prefer externalCode */
    this.code = this.externalCode;
    if (cause) {
      this.cause = cause;
    }
  }
}
