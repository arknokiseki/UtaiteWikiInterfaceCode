/**
 * Exercises the BUILT bundle in jsdom against the real rendered DOM captured
 * from the live wiki, covering the permission gate, button injection and modal
 * wiring that the pure-logic suites cannot reach.
 *
 * Reads from dist/, which is gitignored, so the whole suite skips unless the
 * project has been built. Build with:
 *   node node_modules/vite/bin/vite.js build
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const BUILT = path.resolve('dist/gadgets/contents/UptodateEditor/UptodateEditor.js');

// Verbatim from the live Kogeinu page (2026-08-19).
const LIVE_BOX = '<div class="freshness-box" style="border-color:#9a9a9a">'
  + '<div class="freshness-head" style="background:#9a9a9a">'
  + '<span class="freshness-ic fa-solid fa-triangle-exclamation"></span>'
  + '<span class="freshness-label">Outdated</span>'
  + '<span class="freshness-ago">2 years 9 mo ago</span></div>'
  + '<div class="freshness-body"><div class="freshness-line">Song list last updated <b>October 31, 2023</b>.</div>'
  + '<div class="freshness-meter"><div class="freshness-fill" style="width:3%;background:#9a9a9a"></div></div>'
  + '<div class="freshness-cta">Spot missing covers? Help by updating the list.</div>'
  + '<div class="freshness-meta"><span class="plainlinks">meta</span></div></div></div>';

const ARTICLE = '{{Uptodate/sync}}\n{{Utaite\n<!--Basic Information Section-->\n|gender = Male\n|status = {{Inactive}}\n}}';
const SONGS = '{{Uptodate|October 31, 2023|||bordercolor=#A97A3F}}';

function install(pageName: string, pages: Record<string, string>, groups: string[], user: string | null) {
  const gets: string[] = [];
  (globalThis as any).mw = {
    config: {
      get: (k: string) => ({ wgPageName: pageName, wgUserGroups: groups, wgUserName: user } as any)[k]
    },
    Api: function () {
      return {
        get: (p: any) => {
          gets.push(p.titles);
          const content = pages[p.titles];
          return Promise.resolve(content === undefined
            ? { query: { pages: [{ title: p.titles, missing: true }] } }
            : { query: { pages: [{ title: p.titles, revisions: [{ timestamp: 'T1', slots: { main: { content } } }] }] } });
        },
        postWithToken: () => Promise.resolve({ edit: { result: 'Success' } })
      };
    }
  };
  document.body.innerHTML = LIVE_BOX;
  delete (window as any).uptodateEditorLoaded;
  // eslint-disable-next-line no-eval
  (0, eval)(fs.readFileSync(BUILT, 'utf8'));
  return gets;
}

const flush = () => new Promise(r => setTimeout(r, 0));

const built = fs.existsSync(BUILT);
const maybe = built ? describe : describe.skip;
if (!built) {
  // eslint-disable-next-line no-console
  console.warn('built-bundle.test.ts skipped: run a build first (dist/ is gitignored).');
}

maybe('built bundle', () => {

test('E2E: injects the button into the live .freshness-cta', () => {
  install('Kogeinu', { Kogeinu: ARTICLE, 'Kogeinu/Songs': SONGS }, ['user', 'autoconfirmed'], 'Ed');
  const btn = document.querySelector('.freshness-cta .ute-open') as HTMLButtonElement;
  expect(btn).not.toBeNull();
  expect(btn.textContent).toBe('Update');
});

test('E2E: no button for anonymous users', () => {
  install('Kogeinu', { Kogeinu: ARTICLE }, ['*'], null);
  expect(document.querySelector('.ute-open')).toBeNull();
});

test('E2E: no button for a logged-in non-autoconfirmed user', () => {
  install('Kogeinu', { Kogeinu: ARTICLE }, ['user'], 'New');
  expect(document.querySelector('.ute-open')).toBeNull();
});

test('E2E: clicking resolves /Songs, prefills, pre-ticks pin, previews wikitext', async () => {
  const gets = install('Kogeinu', { Kogeinu: ARTICLE, 'Kogeinu/Songs': SONGS }, ['user', 'autoconfirmed'], 'Ed');
  (document.querySelector('.ute-open') as HTMLButtonElement).click();
  for (let i = 0; i < 12; i++) await flush();

  expect(gets).toContain('Kogeinu');
  expect(gets).toContain('Kogeinu/Songs');

  const modal = document.querySelector('.ute-modal');
  expect(modal).not.toBeNull();
  expect(document.querySelector('.ute-subtitle')!.textContent).toBe('Editing Kogeinu/Songs');

  const date = document.querySelectorAll('.ute-input')[0] as HTMLInputElement;
  expect(date.value).toBe('October 31, 2023');

  const pin = document.querySelector('.ute-check input') as HTMLInputElement;
  expect(pin.checked).toBe(true);
  expect(document.querySelector('.ute-evidence')!.textContent).toContain('{{Inactive}}');

  const preview = document.querySelector('.ute-preview')!;
  expect(preview.textContent).toBe('{{Uptodate|October 31, 2023|||bordercolor=#A97A3F|force-uptodate=yes}}');

  // Untick -> the parameter disappears again.
  pin.checked = false;
  pin.dispatchEvent(new Event('change'));
  expect(preview.textContent).toBe('{{Uptodate|October 31, 2023|||bordercolor=#A97A3F}}');
});

test('E2E: ambiguous status leaves the pin unticked and shows raw text', async () => {
  const mixed = '{{Uptodate/sync}}\n{{Utaite\n|status = {{Graduated}} as Utaite<br/>{{Active}} as pro\n}}';
  install('Kogeinu', { Kogeinu: mixed, 'Kogeinu/Songs': SONGS }, ['user', 'autoconfirmed'], 'Ed');
  (document.querySelector('.ute-open') as HTMLButtonElement).click();
  for (let i = 0; i < 12; i++) await flush();

  const pin = document.querySelector('.ute-check input') as HTMLInputElement;
  expect(pin.checked).toBe(false);
  const ev = document.querySelector('.ute-evidence')!;
  expect(ev.className).toContain('ute-ambiguous');
  expect(ev.textContent).toContain('{{Graduated}} as Utaite');
});

});
