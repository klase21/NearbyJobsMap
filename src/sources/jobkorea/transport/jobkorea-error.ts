export class JobKoreaTransportError extends Error {
  constructor(public readonly code: string, message: string, public readonly url: string | null = null, options?: ErrorOptions) {
    super(message, options);
    this.name = "JobKoreaTransportError";
  }
}
