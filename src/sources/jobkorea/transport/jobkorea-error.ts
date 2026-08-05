export interface JobKoreaTransportErrorContext {
  requestedUrl: string;
  finalUrl: string | null;
  httpStatus: number | null;
  redirectCount: number;
  redirectClassification: "none" | "valid_detail_redirect" | "mobile_desktop_canonical_redirect" | "login_redirect" | "root_redirect" | "malformed_redirect" | "access_denied";
  redirectChain: Array<{ status: number; host: string; path: string }>;
}

export class JobKoreaTransportError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly url: string | null = null,
    options?: ErrorOptions,
    public readonly context: JobKoreaTransportErrorContext | null = null,
  ) {
    super(message, options);
    this.name = "JobKoreaTransportError";
  }
}
