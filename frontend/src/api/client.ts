/**
 * Error with the backend's message and HTTP status. `detail` keeps a structured detail
 * (e.g. {"code": "access_change", ...}) for callers that react to specific cases.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail: unknown = null,
  ) {
    super(message);
  }
}

/**
 * JSON API call. Same-origin cookies carry the gateway session; X-Requested-With is
 * the backend's CSRF check for mutations.
 */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(path, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: {
      'X-Requested-With': 'day',
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    // FastAPI answers {"detail": "..."} (a list of field errors for 422).
    const message = typeof data?.detail === 'string' ? data.detail : `Error ${response.status}`;
    throw new ApiError(message, response.status, data ?? null);
  }
  return data as T;
}
