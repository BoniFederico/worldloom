import { beforeEach, describe, expect, it, vi } from 'vitest';

const set = vi.fn();
vi.mock('next/headers', () => ({ cookies: async () => ({ set }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { setLocale, setTheme } from './actions';

const form = (value: string) => {
  const data = new FormData();
  data.set('value', value);
  return data;
};

describe('server action delle preferenze', () => {
  beforeEach(() => set.mockClear());

  it('scrive il cookie per un valore valido', async () => {
    await setLocale(form('en'));
    await setTheme(form('dark'));
    expect(set).toHaveBeenCalledWith('locale', 'en', expect.objectContaining({ sameSite: 'lax' }));
    expect(set).toHaveBeenCalledWith('theme', 'dark', expect.anything());
  });

  it('ignora valori fuori whitelist', async () => {
    await setLocale(form('fr'));
    await setTheme(form('<script>'));
    expect(set).not.toHaveBeenCalled();
  });
});
