'use server';

import { redirect } from 'next/navigation';
import { safeNextPath } from '@/lib/auth/redirect';
import {
  credentialsSchema,
  resetPasswordSchema,
  resetRequestSchema,
  signUpSchema,
} from '@/lib/auth/schemas';
import { resolveSiteUrl } from '@/lib/site-url';
import { createClient } from '@/lib/supabase/server';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');

const failure = (path: string, error: string): never => redirect(`${path}?error=${error}`);

export async function signUp(formData: FormData) {
  const parsed = signUpSchema.safeParse({
    email: field(formData, 'email'),
    password: field(formData, 'password'),
    displayName: field(formData, 'displayName'),
  });
  if (!parsed.success) return failure('/signup', 'invalid_input');

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${resolveSiteUrl()}/auth/callback`,
    },
  });
  if (error)
    return failure('/signup', error.code === 'weak_password' ? 'invalid_input' : 'generic');
  // Con la verifica email attiva la risposta è identica anche se l'indirizzo esiste già.
  redirect('/login?notice=check_email');
}

export async function signIn(formData: FormData) {
  const parsed = credentialsSchema.safeParse({
    email: field(formData, 'email'),
    password: field(formData, 'password'),
  });
  if (!parsed.success) return failure('/login', 'invalid_credentials');

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    const code =
      error.code === 'email_not_confirmed' ? 'email_not_confirmed' : 'invalid_credentials';
    const next = safeNextPath(field(formData, 'next'));
    return failure('/login', code + (next === '/' ? '' : `&next=${encodeURIComponent(next)}`));
  }
  redirect(safeNextPath(field(formData, 'next')));
}

export async function signInWithGitHub() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: `${resolveSiteUrl()}/auth/callback` },
  });
  if (error || !data.url) return failure('/login', 'generic');
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function requestPasswordReset(formData: FormData) {
  const parsed = resetRequestSchema.safeParse({ email: field(formData, 'email') });
  if (!parsed.success) return failure('/forgot-password', 'invalid_input');

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${resolveSiteUrl()}/auth/callback?next=/reset-password`,
  });
  // Stessa risposta se l'indirizzo non esiste: niente enumerazione degli account.
  redirect('/login?notice=reset_sent');
}

export async function updatePassword(formData: FormData) {
  const parsed = resetPasswordSchema.safeParse({ password: field(formData, 'password') });
  if (!parsed.success) return failure('/reset-password', 'invalid_input');

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return failure('/reset-password', 'generic');
  redirect('/account?notice=password_updated');
}
