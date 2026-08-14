export interface HealthResponse {
  status: "ok";
  timestamp: string;
}

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  path: string;
  requestId: string;
  timestamp: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const apiBaseUrl = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      ApiErrorBody | undefined;
    throw new ApiError(
      body?.message ?? "The service could not complete the request",
      response.status,
      body?.code ?? "REQUEST_FAILED",
      body?.requestId,
    );
  }

  return (await response.json()) as T;
}

export const api = {
  health: (): Promise<HealthResponse> => apiRequest<HealthResponse>("/health"),
};
