import { z } from 'zod';
export { z };
export const username = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(24)
  .regex(/^[a-z0-9_.-]+$/);
export const password = z
  .string()
  .min(10)
  .max(128)
  .regex(/[a-z]/)
  .regex(/[A-Z]/)
  .regex(/[0-9]/)
  .regex(/^[^\r\n]*$/);
export const amount = z.number().int().min(1).max(1000000);
export const choice = z.enum(['HOME', 'AWAY', 'DRAW']);
export const id = z.string().uuid();
export const queryPage = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  skip: z.coerce.number().int().min(0).max(1000000).default(0),
  order: z.enum(['asc', 'desc']).default('desc'),
  status: z.enum(['PENDING', 'WON', 'LOST', 'VOID']).optional(),
});
