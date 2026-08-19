import { resolveTarget, formatJstDate, fetchPage, savePage } from './page-target.js';
import type { WikiApi, FetchedPage } from './page-target.js';

describe('resolveTarget', () => {
  test('a /Songs subpage edits itself and points at its root', () => {
    const t = resolveTarget('Kogeinu/Songs', '{{Uptodate|October 31, 2023}}');
    expect(t.editTitle).toBe('Kogeinu/Songs');
    expect(t.rootTitle).toBe('Kogeinu');
  });

  test('an article using {{Uptodate/sync}} edits the /Songs subpage', () => {
    const t = resolveTarget('Kogeinu', '{{Uptodate/sync}}\n{{Utaite\n|status={{Inactive}}\n}}');
    expect(t.editTitle).toBe('Kogeinu/Songs');
    expect(t.rootTitle).toBe('Kogeinu');
  });

  test('an article with a direct call edits itself', () => {
    const t = resolveTarget('Kogeinu', '{{Uptodate|October 31, 2023}}');
    expect(t.editTitle).toBe('Kogeinu');
    expect(t.rootTitle).toBe('Kogeinu');
  });

  test('an article with neither falls back to the /Songs subpage', () => {
    const t = resolveTarget('Kogeinu', 'Just prose.');
    expect(t.editTitle).toBe('Kogeinu/Songs');
    expect(t.rootTitle).toBe('Kogeinu');
  });

  test('a deeper subpage still resolves the root correctly', () => {
    expect(resolveTarget('A/B/Songs', '{{Uptodate|X}}').rootTitle).toBe('A/B');
  });
});

describe('formatJstDate', () => {
  test('formats as "Month D, YYYY"', () => {
    // 2026-03-01T00:00:00Z is 09:00 JST on the same day.
    expect(formatJstDate(new Date('2026-03-01T00:00:00Z'))).toBe('March 1, 2026');
  });

  test('rolls forward to the next JST day late in UTC', () => {
    // 2026-03-01T16:00:00Z is 01:00 JST on 2 March.
    expect(formatJstDate(new Date('2026-03-01T16:00:00Z'))).toBe('March 2, 2026');
  });
});

function stubApi(overrides: Partial<WikiApi> = {}): WikiApi {
  return {
    get: () => Promise.resolve({ query: { pages: [] } }),
    postWithToken: () => Promise.resolve({}),
    ...overrides
  } as WikiApi;
}

describe('fetchPage', () => {
  test('returns title, content and timestamp', async () => {
    const api = stubApi({
      get: () => Promise.resolve({
        query: {
          pages: [{
            title: 'Kogeinu/Songs',
            revisions: [{
              timestamp: '2026-01-01T00:00:00Z',
              slots: { main: { content: '{{Uptodate|X}}' } }
            }]
          }]
        }
      })
    });
    const page = await fetchPage(api, 'Kogeinu/Songs');
    expect(page).toEqual({
      title: 'Kogeinu/Songs',
      content: '{{Uptodate|X}}',
      timestamp: '2026-01-01T00:00:00Z'
    });
  });

  test('returns null for a missing page', async () => {
    const api = stubApi({
      get: () => Promise.resolve({ query: { pages: [{ title: 'X', missing: true }] } })
    });
    expect(await fetchPage(api, 'X')).toBeNull();
  });

  test('returns null when the response has no pages', async () => {
    expect(await fetchPage(stubApi(), 'X')).toBeNull();
  });
});

describe('savePage', () => {
  test('sends an edit carrying conflict-detection timestamps', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const api = stubApi({
      postWithToken: (token: string, params: Record<string, unknown>) => {
        calls.push({ token, ...params });
        return Promise.resolve({ edit: { result: 'Success' } });
      }
    });
    const page: FetchedPage = {
      title: 'Kogeinu/Songs',
      content: 'old',
      timestamp: '2026-01-01T00:00:00Z'
    };

    await savePage(api, page, 'new', 'summary text');

    expect(calls).toHaveLength(1);
    expect(calls[0].token).toBe('csrf');
    expect(calls[0].action).toBe('edit');
    expect(calls[0].title).toBe('Kogeinu/Songs');
    expect(calls[0].text).toBe('new');
    expect(calls[0].summary).toBe('summary text');
    expect(calls[0].basetimestamp).toBe('2026-01-01T00:00:00Z');
    expect(calls[0].starttimestamp).toBe('2026-01-01T00:00:00Z');
  });

  test('rejects when the API reports an edit conflict', async () => {
    const api = stubApi({
      postWithToken: () => Promise.reject({ error: { code: 'editconflict', info: 'Conflict.' } })
    });
    const page: FetchedPage = { title: 'X', content: 'old', timestamp: 'T' };
    await expect(savePage(api, page, 'new', 's')).rejects.toBeDefined();
  });
});
