import type { Response } from 'express';

/**
 * Standardized API error response format
 */
interface ApiErrorResponse {
  error: string;
  message?: string;
  requestId?: string;
}

/**
 * Send a standardized error response.
 * All API errors should use this function for consistency.
 */
export function sendError(
  res: Response,
  status: number,
  error: string,
  message?: string
): Response {
  const requestId = (res.req as { id?: string })?.id;

  const response: ApiErrorResponse = { error };

  if (message) {
    response.message = message;
  }

  if (requestId) {
    response.requestId = requestId;
  }

  return res.status(status).json(response);
}

/**
 * Common error responses
 */
export const ApiErrors = {
  unauthorized: (res: Response) =>
    sendError(res, 401, 'unauthorized', 'Authentication required'),

  forbidden: (res: Response, message = 'Access denied') =>
    sendError(res, 403, 'forbidden', message),

  notFound: (res: Response, resource = 'Resource') =>
    sendError(res, 404, 'not_found', `${resource} not found`),

  badRequest: (res: Response, message: string) =>
    sendError(res, 400, 'bad_request', message),

  rateLimited: (res: Response) =>
    sendError(res, 429, 'rate_limited', 'Too many requests. Please try again later.'),

  serverError: (res: Response, message = 'An unexpected error occurred') =>
    sendError(res, 500, 'server_error', message),

  serviceUnavailable: (res: Response, message = 'Service temporarily unavailable') =>
    sendError(res, 503, 'service_unavailable', message),
} as const;
