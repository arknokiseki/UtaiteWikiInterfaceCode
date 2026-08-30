import { queryAll, chunk } from './api.ts';
import type { WikiQuery } from './api.ts';

function fakeClient(pages: any[]): WikiQuery {
  let call = 0;
  return {
    async query() {
      call++;
      if (call === 1) return { query: { allpages: pages.slice(0, 2) }, continue: { apcontinue: 'x' } };
      return { query: { allpages: pages.slice(2) } };
    },
  };
}

describe('chunk', () => {
  test('splits into batches of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  test('returns an empty array for empty input', () => {
    expect(chunk([], 50)).toEqual([]);
  });

  test('returns one batch when the size exceeds the input', () => {
    expect(chunk([1, 2], 50)).toEqual([[1, 2]]);
  });
});

describe('queryAll — follows continuation until exhausted', () => {
  test('concatenates every page across continuations', async () => {
    const client = fakeClient([{ title: 'a' }, { title: 'b' }, { title: 'c' }]);
    const got = await queryAll(client, { list: 'allpages' }, (d) => d.query.allpages);
    expect(got.map((p: any) => p.title)).toEqual(['a', 'b', 'c']);
  });

  test('stops after one call when there is no continue key', async () => {
    const client: WikiQuery = {
      async query() {
        return { query: { allpages: [{ title: 'only' }] } };
      },
    };
    const got = await queryAll(client, { list: 'allpages' }, (d) => d.query.allpages);
    expect(got).toHaveLength(1);
  });

  test('passes the continue parameters back on the next call', async () => {
    const seen: Record<string, string>[] = [];
    let call = 0;
    const client: WikiQuery = {
      async query(params) {
        seen.push(params);
        call++;
        if (call === 1) return { query: { allpages: [] }, continue: { apcontinue: 'NEXT' } };
        return { query: { allpages: [] } };
      },
    };
    await queryAll(client, { list: 'allpages' }, (d) => d.query.allpages);
    expect(seen[1].apcontinue).toBe('NEXT');
  });

  test('tolerates a missing result array without throwing', async () => {
    const client: WikiQuery = {
      async query() {
        return { query: {} };
      },
    };
    await expect(queryAll(client, {}, (d) => d.query.allpages)).resolves.toEqual([]);
  });
});
