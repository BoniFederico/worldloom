'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { LOCALES, LOCALE_COOKIE, THEMES, THEME_COOKIE } from '@/i18n/preferences';

const ONE_YEAR = 60 * 60 * 24 * 365;

async function setPreference(name: string, value: string, allowed: readonly string[]) {
  if (!allowed.includes(value)) return;
  (await cookies()).set(name, value, {
    maxAge: ONE_YEAR,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  revalidatePath('/', 'layout');
}

export async function setLocale(formData: FormData) {
  await setPreference(LOCALE_COOKIE, String(formData.get('value')), LOCALES);
}

export async function setTheme(formData: FormData) {
  await setPreference(THEME_COOKIE, String(formData.get('value')), THEMES);
}
