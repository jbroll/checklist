import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

/**
 * Middleware factory for validating request bodies with Zod schemas.
 */
export function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Invalid request body',
        details: result.error.flatten().fieldErrors,
      });
    }
    req.body = result.data;
    next();
  };
}

// Schema for creating share invites
export const createInviteSchema = z.object({
  recipientEmail: z.string().email().max(255),
  folderCoValueId: z.string().min(1).max(255),
  permission: z.enum(['view', 'edit', 'admin']),
  expiresInDays: z.number().int().min(1).max(30).optional().default(7),
});

// Schema for accepting invites
export const acceptInviteSchema = z.object({
  token: z.string().min(1).max(255),
});

export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

// Jazz CoValue ID validation
// CoValue IDs follow the pattern: co_z followed by alphanumeric characters
const JAZZ_COID_REGEX = /^co_z[a-zA-Z0-9]+$/;

/**
 * Validates a Jazz CoValue ID format.
 * Returns true if the ID matches the expected pattern.
 */
export function isValidCoValueId(id: string): boolean {
  return typeof id === 'string' &&
         id.length > 3 &&
         id.length < 100 &&
         JAZZ_COID_REGEX.test(id);
}
