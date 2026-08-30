/**
 * Read-only MediaWiki API access for the documentation audit.
 *
 * This module intentionally exposes ONLY query capability. No mwn write method
 * (save/edit/create/delete/move) is imported here or anywhere under
 * dev-utils/wiki-audit/, so the audit tooling is structurally incapable of
 * modifying the live wiki. The reconciliation roadmap names a premature write
 * to prod as this project's primary risk; that is enforced here by omission
 * rather than by care.
 */

export interface WikiQuery {
  query(params: Record<string, string>): Promise<any>;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function createClient(apiUrl: string, userAgent: string): WikiQuery {
  return {
    async query(params: Record<string, string>): Promise<any> {
      const body = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'User-Agent': userAgent,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });
      if (!res.ok) throw new Error(`API ${res.status} ${res.statusText}`);
      const json = await res.json();
      if (json.error) throw new Error(`API error: ${json.error.code} — ${json.error.info}`);
      return json;
    },
  };
}

/** Runs a query, following MediaWiki continuation until every result is collected. */
export async function queryAll(
  client: WikiQuery,
  params: Record<string, string>,
  extract: (d: any) => any[],
): Promise<any[]> {
  const out: any[] = [];
  let cont: Record<string, string> = {};
  for (;;) {
    const d = await client.query({ ...params, ...cont });
    out.push(...(extract(d) ?? []));
    if (d.continue) cont = d.continue;
    else return out;
  }
}
