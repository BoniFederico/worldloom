import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

// Deve restare allineata a supabase/config.toml (minimum_password_length, password_requirements).
export const newPasswordSchema = z
  .string()
  .min(10)
  .max(128)
  .regex(/[a-z]/)
  .regex(/[A-Z]/)
  .regex(/[0-9]/);

export const signUpSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
  displayName: z.string().trim().min(1).max(60),
});

export const credentialsSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const resetRequestSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({ password: newPasswordSchema });
