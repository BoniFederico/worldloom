import { describe, expect, it } from 'vitest';
import { describeNotification } from './display';
import type { NotificationContext, NotificationRow } from './load';

const emptyContext: NotificationContext = {
  snippets: new Map(),
  sessions: new Map(),
  campaigns: new Map(),
  profiles: new Map(),
};

const base: NotificationRow = {
  id: '1',
  kind: 'reveal',
  world_id: null,
  campaign_id: null,
  data: {},
  read_at: null,
  created_at: '2026-01-01T00:00:00Z',
};

describe('describeNotification: rivelazioni', () => {
  it('uno snippet rivelato collega alla sua pagina e porta titolo e livello', () => {
    const ctx: NotificationContext = {
      ...emptyContext,
      snippets: new Map([['s1', { title: 'Aurelia', world_id: 'w1' }]]),
    };
    const row = {
      ...base,
      world_id: 'w1',
      data: { itemKind: 'snippet', itemId: 's1', toLevel: 'members' },
    };
    expect(describeNotification(row, ctx)).toEqual({
      href: '/worlds/w1/snippets/s1',
      key: 'reveal',
      params: { title: 'Aurelia', level: 'members' },
    });
  });

  it('uno snippet non più raggiungibile mostra comunque un link, con un testo generico invece di un titolo vuoto', () => {
    const row = {
      ...base,
      world_id: 'w1',
      data: { itemKind: 'snippet', itemId: 's1', toLevel: 'public' },
    };
    expect(describeNotification(row, emptyContext)).toEqual({
      href: '/worlds/w1/snippets/s1',
      key: 'revealUnknown',
      params: { level: 'public' },
    });
  });

  it('una relazione o un pin rivelati non hanno una pagina propria: si linka al mondo', () => {
    const row = {
      ...base,
      world_id: 'w1',
      data: { itemKind: 'relation', itemId: 'r1', toLevel: 'shared' },
    };
    expect(describeNotification(row, emptyContext)).toEqual({
      href: '/worlds/w1',
      key: 'revealItem',
      params: { kind: 'relation', level: 'shared' },
    });
  });
});

describe('describeNotification: sessioni', () => {
  it('collega alla sessione e riporta il suo numero', () => {
    const ctx: NotificationContext = {
      ...emptyContext,
      sessions: new Map([['sess1', { number: 3, title: '' }]]),
    };
    const row = {
      ...base,
      kind: 'session',
      campaign_id: 'c1',
      data: { sessionId: 'sess1', number: 3 },
    } as const;
    expect(describeNotification(row, ctx)).toEqual({
      href: '/campaigns/c1/sessions/sess1',
      key: 'session',
      params: { number: 3 },
    });
  });
});

describe('describeNotification: menzioni', () => {
  it('collega allo snippet che ha creato la menzione, con il suo titolo', () => {
    const ctx: NotificationContext = {
      ...emptyContext,
      snippets: new Map([['src', { title: 'Cronaca', world_id: 'w1' }]]),
    };
    const row = {
      ...base,
      kind: 'mention',
      world_id: 'w1',
      data: { sourceSnippetId: 'src', targetSnippetId: 't1' },
    } as const;
    expect(describeNotification(row, ctx)).toEqual({
      href: '/worlds/w1/snippets/src',
      key: 'mention',
      params: { title: 'Cronaca' },
    });
  });

  it('lo snippet che ha citato non è più raggiungibile: link generico dal mondo, testo generico', () => {
    const row = {
      ...base,
      kind: 'mention',
      world_id: 'w1',
      data: { sourceSnippetId: 'src', targetSnippetId: 't1' },
    } as const;
    expect(describeNotification(row, emptyContext)).toEqual({
      href: '/worlds/w1/snippets/src',
      key: 'mentionUnknown',
      params: {},
    });
  });
});

describe('describeNotification: inviti', () => {
  it('un invito ricevuto collega alla campagna, con nome e ruolo', () => {
    const ctx: NotificationContext = { ...emptyContext, campaigns: new Map([['c1', 'La Corona']]) };
    const row = {
      ...base,
      kind: 'invite_received',
      campaign_id: 'c1',
      data: { role: 'player' },
    } as const;
    expect(describeNotification(row, ctx)).toEqual({
      href: '/campaigns/c1',
      key: 'inviteReceived',
      params: { name: 'La Corona', role: 'player' },
    });
  });

  it('chi non è ancora membro non può leggere il nome della campagna: usa quello portato dalla notifica', () => {
    const row = {
      ...base,
      kind: 'invite_received',
      campaign_id: 'c1',
      data: { role: 'player', campaignName: 'La Corona' },
    } as const;
    expect(describeNotification(row, emptyContext)).toEqual({
      href: '/campaigns/c1',
      key: 'inviteReceived',
      params: { name: 'La Corona', role: 'player' },
    });
  });

  it('un invito accettato riporta chi si è unito e con che ruolo', () => {
    const ctx: NotificationContext = {
      ...emptyContext,
      campaigns: new Map([['c1', 'La Corona']]),
      profiles: new Map([['u1', 'Ada']]),
    };
    const row = {
      ...base,
      kind: 'invite_accepted',
      campaign_id: 'c1',
      data: { userId: 'u1', role: 'observer' },
    } as const;
    expect(describeNotification(row, ctx)).toEqual({
      href: '/campaigns/c1',
      key: 'inviteAccepted',
      params: { name: 'La Corona', who: 'Ada', role: 'observer' },
    });
  });
});
