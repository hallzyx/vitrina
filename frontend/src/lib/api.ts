/**
 * Thin client for the Vitrina API. The API is served from the same origin under `/api`
 * (CloudFront routes it to API Gateway), so there is no CORS and no absolute URL to configure.
 */

const CODE_KEY = "vitrina.access-code";

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status} ${code}`);
  }
}

/** The invite phrase lives in sessionStorage only: it is forgotten when the tab closes. */
export function getStoredCode(): string | null {
  try {
    return sessionStorage.getItem(CODE_KEY);
  } catch {
    return null;
  }
}

export function storeCode(code: string): void {
  try {
    sessionStorage.setItem(CODE_KEY, code);
  } catch {
    /* storage may be unavailable; the user will simply be asked again */
  }
}

export function clearStoredCode(): void {
  try {
    sessionStorage.removeItem(CODE_KEY);
  } catch {
    /* ignore */
  }
}

/** Resolves when the phrase is valid; throws ApiRequestError (401, 429, ...) otherwise. */
export async function verifyAccessCode(code: string): Promise<void> {
  const response = await fetch("/api/access/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiRequestError(response.status, body.error ?? "unknown");
  }
}
