import type { Response } from 'express';

/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: string; // Machine-readable error code
  message: string; // Human-readable message
  details?: unknown; // Optional additional context
}

/**
 * Send error response with consistent format
 */
export function sendError(
  res: Response,
  statusCode: number,
  error: string,
  message: string,
  details?: unknown
): void {
  const response: ErrorResponse = {
    error,
    message,
  };

  if (details) {
    response.details = details;
  }

  res.status(statusCode).json(response);
}

/**
 * Common error responses
 */
export const Errors = {
  unauthorized: (res: Response, message = 'Authentication required') =>
    sendError(res, 401, 'unauthorized', message),

  forbidden: (res: Response, message = 'Insufficient permissions') =>
    sendError(res, 403, 'forbidden', message),

  notFound: (res: Response, message = 'Resource not found') =>
    sendError(res, 404, 'not_found', message),

  conflict: (res: Response, message: string) =>
    sendError(res, 409, 'conflict', message),

  rateLimit: (res: Response, message = 'Too many requests, try again later') =>
    sendError(res, 429, 'rate_limit_exceeded', message),

  badRequest: (res: Response, message: string, details?: unknown) =>
    sendError(res, 400, 'bad_request', message, details),

  internalError: (res: Response, message = 'An unexpected error occurred') =>
    sendError(res, 500, 'internal_error', message),
};
