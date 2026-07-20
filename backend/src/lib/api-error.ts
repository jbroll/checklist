/**
 * Standardized API error responses for Express routes.
 * Vendored from @jbr-jazz/hierarchy-backend during the de-jazzing.
 *
 * Generic over the response type so it stays compatible across @types/express versions.
 */

/** Minimal Response shape, for compatibility across express versions. */
export interface MinimalResponse {
  req?: { id?: string } | null;
  status(code: number): this;
  json(body: unknown): this;
}

export interface RequestWithId {
  id?: string;
}

export interface ApiErrorResponse {
  error: string;
  message?: string;
  requestId?: string;
}

/** Send a standardized error response. All API errors go through here. */
export function sendError<T extends MinimalResponse>(
  res: T,
  status: number,
  error: string,
  message?: string,
): T {
  const requestId = (res.req as RequestWithId | undefined)?.id;

  const response: ApiErrorResponse = { error };

  if (message) {
    response.message = message;
  }

  if (requestId) {
    response.requestId = requestId;
  }

  return res.status(status).json(response);
}

export const ApiErrors = {
  unauthorized: <T extends MinimalResponse>(res: T) =>
    sendError(res, 401, 'unauthorized', 'Authentication required'),

  forbidden: <T extends MinimalResponse>(res: T, message = 'Access denied') =>
    sendError(res, 403, 'forbidden', message),

  notFound: <T extends MinimalResponse>(res: T, resource = 'Resource') =>
    sendError(res, 404, 'not_found', `${resource} not found`),

  badRequest: <T extends MinimalResponse>(res: T, message: string) =>
    sendError(res, 400, 'bad_request', message),

  rateLimited: <T extends MinimalResponse>(res: T) =>
    sendError(res, 429, 'rate_limited', 'Too many requests. Please try again later.'),

  serverError: <T extends MinimalResponse>(res: T, message = 'An unexpected error occurred') =>
    sendError(res, 500, 'server_error', message),

  serviceUnavailable: <T extends MinimalResponse>(
    res: T,
    message = 'Service temporarily unavailable',
  ) => sendError(res, 503, 'service_unavailable', message),
} as const;
