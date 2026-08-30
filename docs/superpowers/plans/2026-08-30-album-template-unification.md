# Album Template Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve `Template:AlbumType2` in place into a Lua-backed album renderer that accepts three input dialects, supports unlimited tracks, and fixes the tracklist, metadata and cover-image presentation on desktop and mobile.

**Architecture:** A new `Module:Album` normalises every dialect (`t1*`, legacy `track1*`, legacy `{{Track}}` records) into one album model, decides which columns are earned, detects whether `group` is a section or a tag, and renders card + tracklist + tabs. `Template:Track` stops emitting `<tr>` markup and starts emitting delimited records. `Template:AlbumType2` becomes a thin `#invoke`. Repo-side, the album CSS gains a fixed square cover box and a metadata grid, and the datatables gadget learns to skip small tables and to drive a chip filter for sectioned albums.

**Tech Stack:** Lua 5.1 (Scribunto), MediaWiki templates, TypeScript, Less, Jest, fengari (Lua-under-Node for tests), mwn (read-only wiki API).

**Spec:** `docs/superpowers/specs/2026-08-30-album-template-unification-design.md`

## Global Constraints

- Wiki edits are made **only** at the rollout steps in Tasks 10–12. Everything before that is repo-side or module-namespace sandbox work.
- All wiki API access in this repo is **read-only**. No mwn write method (`save`/`edit`/`create`/`delete`/`move`) may be imported under `dev-utils/`. See the header of `dev-utils/wiki-audit/lib/api.ts`.
- Never batch uncached `action=parse` requests against the live wiki — it returned **HTTP 503** during research. Single cached requests only, spaced out.
- Record separator is `U+001E` (Lua `"\30"`), field separator `U+001F` (Lua `"\31"`).
- Track numbers are **opaque strings**, never coerced to integers. The gadget's `track-number-pre` sort already handles values like `12-a` and `1b`.
- The always-rendered column spine is exactly `# | Title | Utaite | Lyricist | Composer`. Only `Arranger` and `Group` are adaptive. `Details` is not a column.
- `Utaite` falls back to `mw.title.getCurrentTitle().rootText` when blank, preserving `{{Track}}`'s existing `{{ROOTPAGENAME}}` behaviour.
- `N/A` and `-` normalise to empty string on ingest.
- Lua module files live at `wiki/modules/Album.lua` in the repo (mirroring the live wiki, per `docs/prod-reconciliation-roadmap.md`), and are copied to the wiki by hand at rollout.
- Run tests with `npx jest <path>`. Do not add new npm scripts.

---

### Task 1: Lua test harness — ALREADY COMPLETE

**Status:** Done and committed as `d145990`. Verified before planning: `npx jest dev-utils/lua-test` passes 5 tests.

**Files:**
- Created: `dev-utils/lua-test/lua-harness.ts`
- Created: `dev-utils/lua-test/harness.test.ts`
- Modified: `package.json` (added `fengari` devDependency)

**Interfaces:**
- Produces: `loadLuaModule(path: string, globalName?: string): LuaModule` where `LuaModule` is `{ eval(expr: string): string; setRoot(name: string): void }`. `eval` wraps the expression in `tostring(...)` and returns a JS string. The loaded module is bound to the Lua global `M` by default.

Do not redo this task. Later tasks import `loadLuaModule` from `dev-utils/lua-test/lua-harness` (no `.ts` extension — the root tsconfig rejects it).

---

### Task 2: Value normalisation and the typo map

**Files:**
- Create: `wiki/modules/Album.lua`
- Test: `dev-utils/lua-test/album-normalise.test.ts`

**Interfaces:**
- Consumes: `loadLuaModule` from Task 1.
- Produces:
  - `p._clean(v: string|nil) -> string` — trims, maps `N/A` and `-` to `''`.
  - `p._canonical(key: string) -> string` — maps a known misspelling to its correct parameter name, or returns the key unchanged.

- [ ] **Step 1: Write the failing test**

Create `dev-utils/lua-test/album-normalise.test.ts`:

```ts
import { loadLuaModule, type LuaModule } from './lua-harness';

const MODULE = 'wiki/modules/Album.lua';

describe('Module:Album normalisation', () => {
  let m: LuaModule;
  beforeEach(() => {
    m = loadLuaModule(MODULE);
  });

  it('trims surrounding whitespace', () => {
    expect(m.eval(`M._clean('  ryo  ')`)).toBe('ryo');
  });

  it('treats N/A and - as empty', () => {
    expect(m.eval(`M._clean('N/A')`)).toBe('');
    expect(m.eval(`M._clean('  -  ')`)).toBe('');
  });

  it('passes nil through as empty', () => {
    expect(m.eval(`M._clean(nil)`)).toBe('');
  });

  it('does not eat legitimate values containing N/A', () => {
    expect(m.eval(`M._clean('N/A Project')`)).toBe('N/A Project');
  });

  it('maps observed track typos to canonical names', () => {
    expect(m.eval(`M._canonical('trac9arranger')`)).toBe('track9arranger');
    expect(m.eval(`M._canonical('track4lyrcist')`)).toBe('track4lyricist');
    expect(m.eval(`M._canonical('trakk6info')`)).toBe('track6info');
    expect(m.eval(`M._canonical('tracl7composer')`)).toBe('track7composer');
  });

  it('maps observed album-level typos', () => {
    expect(m.eval(`M._canonical('crossfadeYTID')`)).toBe('crossfadeyt');
    expect(m.eval(`M._canonical('daterealeased')`)).toBe('datereleased');
    expect(m.eval(`M._canonical('albumArtist')`)).toBe('albumartist');
    expect(m.eval(`M._canonical('JPshops')`)).toBe('jpshops');
    expect(m.eval(`M._canonical('spotifyalbumID')`)).toBe('spotifyalbumid');
  });

  it('leaves unknown keys untouched', () => {
    expect(m.eval(`M._canonical('albumtitle')`)).toBe('albumtitle');
    expect(m.eval(`M._canonical('completely_unknown')`)).toBe('completely_unknown');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest dev-utils/lua-test/album-normalise -t "trims surrounding"`
Expected: FAIL — `wiki/modules/Album.lua` does not exist, so `loadLuaModule` throws `ENOENT`.

- [ ] **Step 3: Write minimal implementation**

Create `wiki/modules/Album.lua`:

```lua
-- Module:Album — unified album renderer.
-- Accepts three input dialects (t1*, legacy track1*, legacy {{Track}} records),
-- normalises them into one model, and renders card + tracklist + tabs.

local p = {}

--- Trims a value and treats editor placeholders as absent.
-- {{Track}} renders "N/A" for an empty credit, and editors have typed it
-- literally; left alone, a column of nothing but "N/A" would look populated.
function p._clean(v)
  v = mw.text.trim(v or '')
  if v == 'N/A' or v == '-' then return '' end
  return v
end

-- Album-level misspellings observed in live ns-0 wikitext.
local ALBUM_TYPOS = {
  crossfadeytid    = 'crossfadeyt',
  cossradenndid    = 'crossfadennd',
  crossdafenndid   = 'crossfadennd',
  crossfadend      = 'crossfadennd',
  daterealeased    = 'datereleased',
  releasedate      = 'datereleased',
  albumartist      = 'albumartist',
  jpshops          = 'jpshops',
  spotifyalbumid   = 'spotifyalbumid',
  officialjapptitle = 'officialjaptitle',
}

-- Misspelled stems of the per-track parameters, e.g. "trac9arranger".
local TRACK_STEMS = {
  trac = true, trakk = true, tracl = true, trach = true, track = true,
}
local FIELD_TYPOS = {
  lyrcist = 'lyricist', lyricst = 'lyricist', yricist = 'lyricist',
  arrange = 'arranger', arrangement = 'arranger', compsoser = 'composer',
  notes = 'info', note = 'info', singer = 'utaite', singers = 'utaite',
}

--- Maps a known misspelling to its canonical parameter name.
function p._canonical(key)
  local lower = string.lower(key or '')
  if ALBUM_TYPOS[lower] then return ALBUM_TYPOS[lower] end

  local stem, num, field = string.match(lower, '^(%a+)(%d+)(%a+)$')
  if stem and TRACK_STEMS[stem] then
    field = FIELD_TYPOS[field] or field
    return 'track' .. num .. field
  end

  return key
end

return p
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest dev-utils/lua-test/album-normalise`
Expected: PASS, 7 tests.

Note the `albumArtist` case passes through `ALBUM_TYPOS` by lowercasing, and `JPshops`/`spotifyalbumID` likewise — the map's job for those is case folding, not spelling.

- [ ] **Step 5: Commit**

```bash
git add wiki/modules/Album.lua dev-utils/lua-test/album-normalise.test.ts
git commit -m "feat(album): value normalisation and parameter typo map"
```

---

### Task 3: Parse `{{Track}}` records

**Files:**
- Modify: `wiki/modules/Album.lua`
- Test: `dev-utils/lua-test/album-records.test.ts`

**Interfaces:**
- Consumes: `p._clean` from Task 2.
- Produces:
  - `p._isLegacyHtml(blob: string) -> boolean` — true when the blob looks like pre-migration `<tr>` output.
  - `p._parseRecords(blob: string) -> table` — array of track tables with keys `n, title, info, utaite, lyricist, composer, arranger, group`.

- [ ] **Step 1: Write the failing test**

Create `dev-utils/lua-test/album-records.test.ts`:

```ts
import { loadLuaModule, type LuaModule } from './lua-harness';

const MODULE = 'wiki/modules/Album.lua';
const RS = '\\30';
const FS = '\\31';

/** Builds a Lua string literal for a record blob. */
function blob(rows: string[][]): string {
  return rows.map((r) => RS + r.join(FS)).join('');
}

describe('Module:Album {{Track}} record parsing', () => {
  let m: LuaModule;
  beforeEach(() => {
    m = loadLuaModule(MODULE);
  });

  it('parses a single record into fields', () => {
    const b = blob([['1', 'Melt', 'TV size', 'Soraru', 'ryo', 'ryo', 'Kz', 'Disc 1']]);
    expect(m.eval(`#M._parseRecords("${b}")`)).toBe('1');
    expect(m.eval(`M._parseRecords("${b}")[1].title`)).toBe('Melt');
    expect(m.eval(`M._parseRecords("${b}")[1].n`)).toBe('1');
    expect(m.eval(`M._parseRecords("${b}")[1].group`)).toBe('Disc 1');
  });

  it('parses many records', () => {
    const b = blob([
      ['1', 'A', '', '', 'ryo', 'ryo', '', ''],
      ['2', 'B', '', '', 'Neru', 'Neru', 'Neru', ''],
      ['3', 'C', '', '', '', '', '', ''],
    ]);
    expect(m.eval(`#M._parseRecords("${b}")`)).toBe('3');
    expect(m.eval(`M._parseRecords("${b}")[2].arranger`)).toBe('Neru');
    expect(m.eval(`M._parseRecords("${b}")[3].title`)).toBe('C');
  });

  it('normalises N/A inside records', () => {
    const b = blob([['1', 'A', '', '', 'N/A', 'ryo', '', '']]);
    expect(m.eval(`M._parseRecords("${b}")[1].lyricist`)).toBe('');
  });

  it('preserves suffixed track numbers verbatim', () => {
    const b = blob([['12-a', 'A', '', '', '', '', '', '']]);
    expect(m.eval(`M._parseRecords("${b}")[1].n`)).toBe('12-a');
  });

  it('keeps wikitext and nested template output intact in a field', () => {
    const b = blob([['1', '[[Melt]] {{VW|abc}}', '', '', '', '', '', '']]);
    expect(m.eval(`M._parseRecords("${b}")[1].title`)).toBe('[[Melt]] {{VW|abc}}');
  });

  it('detects legacy <tr> output', () => {
    expect(m.eval(`tostring(M._isLegacyHtml('<tr><td>1</td></tr>'))`)).toBe('true');
    expect(m.eval(`tostring(M._isLegacyHtml("${blob([['1', 'A', '', '', '', '', '', '']])}"))`)).toBe('false');
    expect(m.eval(`tostring(M._isLegacyHtml(''))`)).toBe('false');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest dev-utils/lua-test/album-records`
Expected: FAIL — `attempt to call a nil value (field '_parseRecords')`.

- [ ] **Step 3: Write minimal implementation**

Append to `wiki/modules/Album.lua`, before `return p`:

```lua
local RS = '\30'
local FS = '\31'

local RECORD_FIELDS = {
  'n', 'title', 'info', 'utaite', 'lyricist', 'composer', 'arranger', 'group',
}

--- True when |track= still holds pre-migration {{Track}} markup.
-- Template edits purge dependent pages lazily, so a cached page can deliver
-- old <tr> output to the new module. Detecting it lets us pass it through
-- rather than requiring the two template edits to be ordered.
function p._isLegacyHtml(blob)
  blob = blob or ''
  if string.find(blob, RS, 1, true) then return false end
  return string.find(blob, '<tr', 1, true) ~= nil
end

--- Splits a |track= blob of {{Track}} records into track tables.
function p._parseRecords(blob)
  local tracks = {}
  for record in string.gmatch(blob or '', RS .. '([^' .. RS .. ']*)') do
    local track, i = {}, 1
    -- Trailing empty fields are preserved by appending a sentinel separator.
    for field in string.gmatch(record .. FS, '([^' .. FS .. ']*)' .. FS) do
      local key = RECORD_FIELDS[i]
      if key then
        track[key] = (key == 'n') and mw.text.trim(field) or p._clean(field)
      end
      i = i + 1
    end
    if track.title and track.title ~= '' then
      tracks[#tracks + 1] = track
    end
  end
  return tracks
end
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest dev-utils/lua-test/album-records`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add wiki/modules/Album.lua dev-utils/lua-test/album-records.test.ts
git commit -m "feat(album): parse {{Track}} delimited records"
```

---

### Task 4: Collect tracks from the `t1*` and `track1*` dialects

**Files:**
- Modify: `wiki/modules/Album.lua`
- Test: `dev-utils/lua-test/album-collect.test.ts`

**Interfaces:**
- Consumes: `p._clean`, `p._canonical` (Task 2); `p._parseRecords`, `p._isLegacyHtml` (Task 3).
- Produces:
  - `p._collectTracks(args: table) -> table` — array of track tables ordered by index, from whichever dialect `args` uses.
  - `p._unknownParams(args: table) -> table` — sorted array of argument names the module does not recognise, so the long tail of typos beyond the mapped set becomes findable instead of silent.

Critically, track discovery must **not** stop at the first missing index. `Template:Album` discards every track after a gap; one live album reaches index 154.

- [ ] **Step 1: Write the failing test**

Create `dev-utils/lua-test/album-collect.test.ts`:

```ts
import { loadLuaModule, type LuaModule } from './lua-harness';

const MODULE = 'wiki/modules/Album.lua';

/** Renders a JS object as a Lua table literal. */
function luaTable(o: Record<string, string>): string {
  const body = Object.entries(o)
    .map(([k, v]) => `['${k}']=${JSON.stringify(v)}`)
    .join(',');
  return `{${body}}`;
}

describe('Module:Album track collection', () => {
  let m: LuaModule;
  beforeEach(() => {
    m = loadLuaModule(MODULE);
  });

  it('collects the new t1* dialect', () => {
    const a = luaTable({
      t1title: 'Melt', t1lyricist: 'ryo', t1composer: 'ryo',
      t2title: 'Alone', t2lyricist: 'Foo',
    });
    expect(m.eval(`#M._collectTracks(${a})`)).toBe('2');
    expect(m.eval(`M._collectTracks(${a})[1].title`)).toBe('Melt');
    expect(m.eval(`M._collectTracks(${a})[2].lyricist`)).toBe('Foo');
  });

  it('uses the index as the track number', () => {
    const a = luaTable({ t1title: 'A', t2title: 'B' });
    expect(m.eval(`M._collectTracks(${a})[2].n`)).toBe('2');
  });

  it('collects the legacy track1* dialect', () => {
    const a = luaTable({
      track1title: 'Melt', track1utaite: 'Soraru', track1info: 'TV size',
      track2title: 'Alone',
    });
    expect(m.eval(`#M._collectTracks(${a})`)).toBe('2');
    expect(m.eval(`M._collectTracks(${a})[1].utaite`)).toBe('Soraru');
    expect(m.eval(`M._collectTracks(${a})[1].info`)).toBe('TV size');
  });

  it('accepts t1singers as an alias of t1utaite', () => {
    const a = luaTable({ t1title: 'A', t1singers: 'Soraru' });
    expect(m.eval(`M._collectTracks(${a})[1].utaite`)).toBe('Soraru');
  });

  it('does NOT stop at a gap in numbering', () => {
    const a = luaTable({ t1title: 'A', t3title: 'C', t5title: 'E' });
    expect(m.eval(`#M._collectTracks(${a})`)).toBe('3');
    expect(m.eval(`M._collectTracks(${a})[3].title`)).toBe('E');
    expect(m.eval(`M._collectTracks(${a})[3].n`)).toBe('5');
  });

  it('handles a very high index without truncating', () => {
    const a = luaTable({ t1title: 'first', t154title: 'last' });
    expect(m.eval(`#M._collectTracks(${a})`)).toBe('2');
    expect(m.eval(`M._collectTracks(${a})[2].title`)).toBe('last');
    expect(m.eval(`M._collectTracks(${a})[2].n`)).toBe('154');
  });

  it('repairs misspelled track parameters', () => {
    const a = luaTable({ track1title: 'A', trac1arranger: 'Kz' });
    expect(m.eval(`M._collectTracks(${a})[1].arranger`)).toBe('Kz');
  });

  it('prefers the |track= record dialect when present', () => {
    const a = luaTable({ track: '1FromRecord', t1title: 'Ignored' });
    expect(m.eval(`#M._collectTracks(${a})`)).toBe('1');
    expect(m.eval(`M._collectTracks(${a})[1].title`)).toBe('FromRecord');
  });

  it('returns no tracks for legacy html, leaving passthrough to the renderer', () => {
    const a = luaTable({ track: '<tr><td>1</td><td>Old</td></tr>' });
    expect(m.eval(`#M._collectTracks(${a})`)).toBe('0');
  });

  it('folds unsupported per-track fields into info rather than dropping them', () => {
    const a = luaTable({ t1title: 'A', t1mixer: 'Kz', t1guitar: 'Foo' });
    expect(m.eval(`M._collectTracks(${a})[1].info`)).toBe('mixer: Kz, guitar: Foo');
  });

  it('appends unsupported fields after an existing info value', () => {
    const a = luaTable({ t1title: 'A', t1info: 'TV size', t1mixer: 'Kz' });
    expect(m.eval(`M._collectTracks(${a})[1].info`)).toBe('TV size mixer: Kz');
  });

  it('reports nothing unknown for a well-formed album', () => {
    const a = luaTable({ albumtitle: 'A', datereleased: 'x', t1title: 'Melt' });
    expect(m.eval(`#M._unknownParams(${a})`)).toBe('0');
  });

  it('reports genuinely unrecognised parameters', () => {
    const a = luaTable({ albumtitle: 'A', itunes: 'x', toranonana: 'y' });
    expect(m.eval(`table.concat(M._unknownParams(${a}), ',')`)).toBe('itunes,toranonana');
  });

  it('does not report parameters it repaired via the typo map', () => {
    const a = luaTable({ albumtitle: 'A', daterealeased: '2024-01-01' });
    expect(m.eval(`#M._unknownParams(${a})`)).toBe('0');
  });

  it('does not report well-formed track parameters at any index', () => {
    const a = luaTable({ albumtitle: 'A', t154arranger: 'Kz', track9composer: 'ryo' });
    expect(m.eval(`#M._unknownParams(${a})`)).toBe('0');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest dev-utils/lua-test/album-collect`
Expected: FAIL — `attempt to call a nil value (field '_collectTracks')`.

- [ ] **Step 3: Write minimal implementation**

Append to `wiki/modules/Album.lua`, before `return p`:

```lua
local TRACK_FIELDS = {
  'title', 'info', 'utaite', 'lyricist', 'composer', 'arranger', 'group',
}

-- Fields editors reach for that no dialect supports. Observed live:
-- track#mixer x4, track8guitar. Folded into info rather than discarded.
local EXTRA_FIELDS = { 'mixer', 'guitar', 'bass' }

--- Reads one track's fields for index `idx` under a given prefix.
local function readTrack(norm, prefix, idx)
  local track = { n = tostring(idx) }
  local any = false
  for _, field in ipairs(TRACK_FIELDS) do
    local v = p._clean(norm[prefix .. idx .. field])
    track[field] = v
    if v ~= '' then any = true end
  end
  if track.utaite == '' then
    track.utaite = p._clean(norm[prefix .. idx .. 'singers'])
    if track.utaite ~= '' then any = true end
  end

  local extras = {}
  for _, field in ipairs(EXTRA_FIELDS) do
    local v = p._clean(norm[prefix .. idx .. field])
    if v ~= '' then extras[#extras + 1] = field .. ': ' .. v end
  end
  if #extras > 0 then
    local suffix = table.concat(extras, ', ')
    track.info = (track.info ~= '' and (track.info .. ' ' .. suffix) or suffix)
    any = true
  end

  return track, any
end

--- Normalises every argument key once, repairing known misspellings.
local function normaliseArgs(args)
  local norm = {}
  for k, v in pairs(args) do
    if type(k) == 'string' then
      norm[p._canonical(k)] = v
    else
      norm[k] = v
    end
  end
  return norm
end

--- Builds the ordered track list from whichever dialect `args` uses.
function p._collectTracks(args)
  local norm = normaliseArgs(args)

  local blob = norm.track
  if blob and blob ~= '' then
    if p._isLegacyHtml(blob) then return {} end
    return p._parseRecords(blob)
  end

  -- Scan for the highest populated index rather than stopping at the first
  -- gap; Template:Album's stop-at-gap behaviour silently drops later tracks.
  local indices, seen = {}, {}
  for key in pairs(norm) do
    if type(key) == 'string' then
      local prefix, idx = string.match(key, '^(t)(%d+)title$')
      if not prefix then prefix, idx = string.match(key, '^(track)(%d+)title$') end
      if prefix and not seen[prefix .. idx] then
        seen[prefix .. idx] = true
        indices[#indices + 1] = { prefix = prefix, idx = tonumber(idx) }
      end
    end
  end

  table.sort(indices, function(a, b) return a.idx < b.idx end)

  local tracks = {}
  for _, entry in ipairs(indices) do
    local track, any = readTrack(norm, entry.prefix, entry.idx)
    if any then tracks[#tracks + 1] = track end
  end
  return tracks
end

-- Album-level parameters the module understands.
local KNOWN_ARGS = {
  albumtitle = true, officialjaptitle = true, officialromtitle = true,
  officialengtitle = true, image = true, imagelink = true, imagealt = true,
  imagealt1 = true, imagealt2 = true, imagealt3 = true, imagealt4 = true,
  albumartist = true, singers = true, datereleased = true, label = true,
  catalognumber = true, track = true, gallery = true, suppressacg = true,
  jpshops = true, shops = true, streams = true, nostreams = true,
  noshops = true, spotifyalbumid = true, crossfadeyt = true, ytxfddesc = true,
  crossfadennd = true, nndxfddesc = true, type = true, groupstyle = true,
  tablefilter = true, tsp = true, tss = true, tracksectionprefix = true,
  tracksectionsuffix = true, download = true, downloads = true,
}

local function isTrackArg(key)
  local suffix = string.match(key, '^t%d+(%a+)$') or string.match(key, '^track%d+(%a+)$')
  if not suffix then return false end
  for _, field in ipairs(TRACK_FIELDS) do
    if suffix == field then return true end
  end
  for _, field in ipairs(EXTRA_FIELDS) do
    if suffix == field then return true end
  end
  return suffix == 'singers'
end

--- Lists argument names the module does not recognise, after typo repair.
function p._unknownParams(args)
  local unknown = {}
  for key in pairs(args or {}) do
    if type(key) == 'string' then
      local canonical = p._canonical(key)
      if not KNOWN_ARGS[canonical] and not isTrackArg(canonical) then
        unknown[#unknown + 1] = key
      end
    end
  end
  table.sort(unknown)
  return unknown
end
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest dev-utils/lua-test/album-collect`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add wiki/modules/Album.lua dev-utils/lua-test/album-collect.test.ts
git commit -m "feat(album): collect tracks from t1* and legacy track1* dialects"
```

---

### Task 5: Column analysis and credit merging

**Files:**
- Modify: `wiki/modules/Album.lua`
- Test: `dev-utils/lua-test/album-columns.test.ts`

**Interfaces:**
- Consumes: `p._clean` (Task 2).
- Produces:
  - `p._columns(tracks: table) -> table` — array of column names, always beginning with the five-column spine.
  - `p._credit(track: table) -> string` — merged credit line, e.g. `lyrics, music: ryo · arrange: Kz`. Consumed by `p._renderTracklist` in Task 7, which embeds it in the title cell for the mobile layout.

- [ ] **Step 1: Write the failing test**

Create `dev-utils/lua-test/album-columns.test.ts`:

```ts
import { loadLuaModule, type LuaModule } from './lua-harness';

const MODULE = 'wiki/modules/Album.lua';

function tracks(rows: Record<string, string>[]): string {
  const items = rows.map(
    (r) => `{${Object.entries(r).map(([k, v]) => `['${k}']=${JSON.stringify(v)}`).join(',')}}`,
  );
  return `{${items.join(',')}}`;
}

describe('Module:Album columns and credits', () => {
  let m: LuaModule;
  beforeEach(() => {
    m = loadLuaModule(MODULE);
  });

  const join = (t: string) => `table.concat(M._columns(${t}), '|')`;

  it('always renders the five-column spine', () => {
    expect(m.eval(join(tracks([{ title: 'A' }])))).toBe('#|Title|Utaite|Lyricist|Composer');
  });

  it('adds Arranger only when some track fills it', () => {
    expect(m.eval(join(tracks([{ title: 'A' }, { title: 'B', arranger: 'Kz' }])))).toBe(
      '#|Title|Utaite|Lyricist|Composer|Arranger',
    );
  });

  it('adds Group only when some track fills it', () => {
    expect(m.eval(join(tracks([{ title: 'A', group: 'Disc 1' }])))).toBe(
      '#|Title|Utaite|Lyricist|Composer|Group',
    );
  });

  it('keeps Utaite even when every track leaves it blank', () => {
    expect(m.eval(join(tracks([{ title: 'A' }, { title: 'B' }])))).toContain('Utaite');
  });

  it('merges roles that share a person', () => {
    expect(m.eval(`M._credit({lyricist='ryo', composer='ryo'})`)).toBe('lyrics, music: ryo');
  });

  it('merges all three roles', () => {
    expect(m.eval(`M._credit({lyricist='ryo', composer='ryo', arranger='ryo'})`)).toBe(
      'lyrics, music, arrange: ryo',
    );
  });

  it('separates distinct people', () => {
    expect(m.eval(`M._credit({lyricist='ryo', composer='ryo', arranger='Kz'})`)).toBe(
      'lyrics, music: ryo · arrange: Kz',
    );
  });

  it('omits absent roles', () => {
    expect(m.eval(`M._credit({composer='ryo'})`)).toBe('music: ryo');
  });

  it('returns empty when no credits exist', () => {
    expect(m.eval(`M._credit({title='A'})`)).toBe('');
  });

  it('ignores N/A credits', () => {
    expect(m.eval(`M._credit({lyricist='N/A', composer='ryo'})`)).toBe('music: ryo');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest dev-utils/lua-test/album-columns`
Expected: FAIL — `attempt to call a nil value (field '_columns')`.

- [ ] **Step 3: Write minimal implementation**

Append to `wiki/modules/Album.lua`, before `return p`:

```lua
-- Always rendered. Utaite is pinned because {{Track}} falls back to the page's
-- own singer when the field is blank, so the column is never actually empty.
local SPINE = { '#', 'Title', 'Utaite', 'Lyricist', 'Composer' }

--- Returns the column names this album has earned.
function p._columns(tracks)
  local cols = {}
  for _, name in ipairs(SPINE) do cols[#cols + 1] = name end

  local hasArranger, hasGroup = false, false
  for _, t in ipairs(tracks or {}) do
    if p._clean(t.arranger) ~= '' then hasArranger = true end
    if p._clean(t.group) ~= '' then hasGroup = true end
  end

  if hasArranger then cols[#cols + 1] = 'Arranger' end
  if hasGroup then cols[#cols + 1] = 'Group' end
  return cols
end

local ROLES = {
  { label = 'lyrics',  field = 'lyricist' },
  { label = 'music',   field = 'composer' },
  { label = 'arrange', field = 'arranger' },
}

--- Builds a credit line, merging roles performed by the same person.
-- Restores behaviour Template:Album has and AlbumType2 lost: when the
-- lyricist and composer are the same person, name them once.
function p._credit(track)
  local order, byName = {}, {}
  for _, role in ipairs(ROLES) do
    local who = p._clean(track[role.field])
    if who ~= '' then
      if not byName[who] then
        byName[who] = {}
        order[#order + 1] = who
      end
      local roles = byName[who]
      roles[#roles + 1] = role.label
    end
  end

  local parts = {}
  for _, who in ipairs(order) do
    parts[#parts + 1] = table.concat(byName[who], ', ') .. ': ' .. who
  end
  return table.concat(parts, ' \194\183 ')
end
```

The separator `\194\183` is UTF-8 for `·` (U+00B7); Lua 5.1 has no `\u` escape.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest dev-utils/lua-test/album-columns`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add wiki/modules/Album.lua dev-utils/lua-test/album-columns.test.ts
git commit -m "feat(album): earned-column analysis and credit merging"
```

---

### Task 6: Group partition detection

**Files:**
- Modify: `wiki/modules/Album.lua`
- Test: `dev-utils/lua-test/album-groups.test.ts`

**Interfaces:**
- Consumes: `p._clean` (Task 2).
- Produces:
  - `p._groupMode(tracks: table, override: string|nil) -> string` — one of `'none'`, `'section'`, `'badge'`, `'column'`.
  - `p._sections(tracks: table) -> table` — array of `{ label = string, tracks = table }` in source order.

- [ ] **Step 1: Write the failing test**

Create `dev-utils/lua-test/album-groups.test.ts`:

```ts
import { loadLuaModule, type LuaModule } from './lua-harness';

const MODULE = 'wiki/modules/Album.lua';

/** Builds a Lua track list from a list of group labels. */
function byGroups(groups: string[]): string {
  const items = groups.map((g, i) => `{title='T${i + 1}', group=${JSON.stringify(g)}}`);
  return `{${items.join(',')}}`;
}

describe('Module:Album group partitioning', () => {
  let m: LuaModule;
  beforeEach(() => {
    m = loadLuaModule(MODULE);
  });

  it('reports none when no track has a group', () => {
    expect(m.eval(`M._groupMode({{title='A'},{title='B'}})`)).toBe('none');
  });

  it('chooses section when each value is one contiguous run', () => {
    const t = byGroups(['Disc 1', 'Disc 1', 'Disc 2', 'Disc 2', 'Disc 3']);
    expect(m.eval(`M._groupMode(${t})`)).toBe('section');
  });

  it('chooses badge when values interleave', () => {
    const t = byGroups(['All editions', 'Type A', 'All editions', 'Type B']);
    expect(m.eval(`M._groupMode(${t})`)).toBe('badge');
  });

  it('honours an explicit override', () => {
    const t = byGroups(['Disc 1', 'Disc 1', 'Disc 2']);
    expect(m.eval(`M._groupMode(${t}, 'badge')`)).toBe('badge');
    expect(m.eval(`M._groupMode(${t}, 'column')`)).toBe('column');
  });

  it('ignores an override when no track has a group', () => {
    expect(m.eval(`M._groupMode({{title='A'}}, 'section')`)).toBe('none');
  });

  it('splits contiguous groups into sections in source order', () => {
    const t = byGroups(['Disc 1', 'Disc 1', 'Disc 2']);
    expect(m.eval(`#M._sections(${t})`)).toBe('2');
    expect(m.eval(`M._sections(${t})[1].label`)).toBe('Disc 1');
    expect(m.eval(`#M._sections(${t})[1].tracks`)).toBe('2');
    expect(m.eval(`M._sections(${t})[2].label`)).toBe('Disc 2');
    expect(m.eval(`#M._sections(${t})[2].tracks`)).toBe('1');
  });

  it('models the real Sekaiiro shape: 17 / 17 / 10', () => {
    const groups = ([] as string[])
      .concat(Array(17).fill('Disc 1'))
      .concat(Array(17).fill('Disc 2'))
      .concat(Array(10).fill('Disc 3 (Limited Edition A only)'));
    const t = byGroups(groups);
    expect(m.eval(`M._groupMode(${t})`)).toBe('section');
    expect(m.eval(`#M._sections(${t})`)).toBe('3');
    expect(m.eval(`#M._sections(${t})[3].tracks`)).toBe('10');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest dev-utils/lua-test/album-groups`
Expected: FAIL — `attempt to call a nil value (field '_groupMode')`.

- [ ] **Step 3: Write minimal implementation**

Append to `wiki/modules/Album.lua`, before `return p`:

```lua
--- Splits tracks into runs of equal group value, in source order.
function p._sections(tracks)
  local sections, current = {}, nil
  for _, t in ipairs(tracks or {}) do
    local label = p._clean(t.group)
    if not current or current.label ~= label then
      current = { label = label, tracks = {} }
      sections[#sections + 1] = current
    end
    current.tracks[#current.tracks + 1] = t
  end
  return sections
end

--- Decides how `group` should be rendered for this album.
-- `group` carries two meanings in live data: a disc/edition partition whose
-- values form contiguous runs (19 of 26 albums), and a per-track tag whose
-- values interleave (7 of 26). Sectioning the latter shatters the list.
function p._groupMode(tracks, override)
  local any = false
  for _, t in ipairs(tracks or {}) do
    if p._clean(t.group) ~= '' then any = true break end
  end
  if not any then return 'none' end

  override = p._clean(override)
  if override == 'section' or override == 'badge' or override == 'column' then
    return override
  end

  local runs = {}
  for _, section in ipairs(p._sections(tracks)) do
    runs[section.label] = (runs[section.label] or 0) + 1
    if runs[section.label] > 1 then return 'badge' end
  end
  return 'section'
end
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest dev-utils/lua-test/album-groups`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add wiki/modules/Album.lua dev-utils/lua-test/album-groups.test.ts
git commit -m "feat(album): detect group as section partition or per-track tag"
```

---

### Task 7: Render the tracklist

**Files:**
- Modify: `wiki/modules/Album.lua`
- Test: `dev-utils/lua-test/album-render.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–6, including `p._credit` from Task 5 — Task 7 is its only caller.
- Produces: `p._renderTracklist(tracks: table, opts: table) -> string`. `opts` accepts `groupstyle`, `tablefilter`, and `root` (the ROOTPAGENAME fallback value).

Rendering rules: one `<table>` per section; DataTables classes only past the row threshold; sectioned albums never get DataTables; a section header is a `<div>` between tables, never a `<tr>` inside one.

- [ ] **Step 1: Write the failing test**

Create `dev-utils/lua-test/album-render.test.ts`:

```ts
import { loadLuaModule, type LuaModule } from './lua-harness';

const MODULE = 'wiki/modules/Album.lua';

function tracks(rows: Record<string, string>[]): string {
  const items = rows.map(
    (r) => `{${Object.entries(r).map(([k, v]) => `['${k}']=${JSON.stringify(v)}`).join(',')}}`,
  );
  return `{${items.join(',')}}`;
}

function many(n: number, group?: string): string {
  const rows = Array.from({ length: n }, (_, i) => ({
    title: `T${i + 1}`,
    n: String(i + 1),
    ...(group ? { group } : {}),
  }));
  return tracks(rows);
}

describe('Module:Album tracklist rendering', () => {
  let m: LuaModule;
  beforeEach(() => {
    m = loadLuaModule(MODULE);
  });

  const render = (t: string, opts = '{}') => m.eval(`M._renderTracklist(${t}, ${opts})`);

  it('emits one table for an unsectioned album', () => {
    const html = render(many(5));
    expect(html.match(/<table/g)).toHaveLength(1);
  });

  it('omits DataTables classes for a small table', () => {
    expect(render(many(5))).not.toContain('dataTable');
  });

  it('adds DataTables classes past the threshold', () => {
    expect(render(many(20))).toContain('dataTable');
  });

  it('respects tablefilter=never', () => {
    expect(render(many(20), `{tablefilter='never'}`)).not.toContain('dataTable');
  });

  it('emits one table per section', () => {
    const t = tracks([
      { title: 'A', n: '1', group: 'Disc 1' },
      { title: 'B', n: '2', group: 'Disc 1' },
      { title: 'C', n: '3', group: 'Disc 2' },
    ]);
    expect(render(t).match(/<table/g)).toHaveLength(2);
  });

  it('never puts a section header inside a table body', () => {
    const t = tracks([
      { title: 'A', n: '1', group: 'Disc 1' },
      { title: 'B', n: '2', group: 'Disc 2' },
    ]);
    const html = render(t);
    expect(html).toContain('album-track-section');
    expect(html).not.toMatch(/<tbody>[\s\S]*album-track-section/);
  });

  it('suppresses DataTables on a sectioned album even when large', () => {
    expect(render(many(20, 'Disc 1'))).not.toContain('dataTable');
  });

  it('falls back to the root page name for a blank utaite', () => {
    const t = tracks([{ title: 'A', n: '1' }]);
    expect(render(t, `{root='Mafumafu'}`)).toContain('Mafumafu');
  });

  it('renders a badge for interleaved groups', () => {
    const t = tracks([
      { title: 'A', n: '1', group: 'All editions' },
      { title: 'B', n: '2', group: 'Type A' },
      { title: 'C', n: '3', group: 'All editions' },
    ]);
    const html = render(t);
    expect(html).toContain('album-track-badge');
    expect(html.match(/<table/g)).toHaveLength(1);
  });

  it('escapes nothing in title values, so wikitext still expands', () => {
    const t = tracks([{ title: '[[Melt]]', n: '1' }]);
    expect(render(t)).toContain('[[Melt]]');
  });

  it('embeds the merged credit line in the title cell for mobile', () => {
    const t = tracks([{ title: 'Melt', n: '1', lyricist: 'ryo', composer: 'ryo' }]);
    const html = render(t);
    expect(html).toContain('<span class="album-track-credit">lyrics, music: ryo</span>');
  });

  it('omits the credit span when a track has no credits', () => {
    expect(render(tracks([{ title: 'Melt', n: '1' }]))).not.toContain('album-track-credit');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest dev-utils/lua-test/album-render`
Expected: FAIL — `attempt to call a nil value (field '_renderTracklist')`.

- [ ] **Step 3: Write minimal implementation**

Append to `wiki/modules/Album.lua`, before `return p`:

```lua
-- Below this many rows a table is plain markup with no DataTables instance.
-- Measured: 67% of live tracklists have 10 rows or fewer, yet all 783 boot
-- DataTables with pagination and search panes today.
local FILTER_THRESHOLD = 15

local COLUMN_FIELD = {
  ['#'] = 'n', Title = 'title', Utaite = 'utaite', Lyricist = 'lyricist',
  Composer = 'composer', Arranger = 'arranger', Group = 'group',
}

local function attr(name, value)
  return ' ' .. name .. '="' .. value .. '"'
end

local function renderRow(track, columns, opts, mode)
  local cells = {}
  for _, col in ipairs(columns) do
    local field = COLUMN_FIELD[col]
    local value = (field == 'n') and mw.text.trim(track.n or '') or p._clean(track[field])

    if field == 'utaite' and value == '' then
      value = opts.root or ''
    end
    if field == 'title' then
      local info = p._clean(track.info)
      if info ~= '' then
        value = value .. ' <span class="album-track-info">' .. info .. '</span>'
      end
      if mode == 'badge' and p._clean(track.group) ~= '' then
        value = value .. ' <span class="album-track-badge">' .. p._clean(track.group) .. '</span>'
      end
      -- The merged credit line rides inside the title cell rather than in a
      -- column of its own, so the column count stays stable for DataTables.
      -- CSS hides it on desktop and reveals it on mobile, where the separate
      -- credit columns are hidden instead.
      local credit = p._credit(track)
      if credit ~= '' then
        value = value .. '<span class="album-track-credit">' .. credit .. '</span>'
      end
    end
    if value == '' and field ~= 'n' and field ~= 'title' then
      value = '&mdash;'
    end

    local class = (field == 'n') and ' class="album-track-n"' or ''
    cells[#cells + 1] = '<td' .. class .. '>' .. value .. '</td>'
  end
  return '<tr>' .. table.concat(cells) .. '</tr>'
end

local function renderTable(rows, columns, opts, mode, useFilter)
  local classes = 'wikitable album-track-table'
  local extra = ''
  if useFilter then
    classes = classes .. ' dataTable'
    extra = attr('data-page-length', '25') .. attr('data-order', '[[0, "asc"]]')
  end

  local heads = {}
  for _, col in ipairs(columns) do
    heads[#heads + 1] = '<th scope="col">' .. col .. '</th>'
  end

  local body = {}
  for _, track in ipairs(rows) do
    body[#body + 1] = renderRow(track, columns, opts, mode)
  end

  return '<table' .. attr('class', classes) .. extra .. '>'
    .. '<thead><tr>' .. table.concat(heads) .. '</tr></thead>'
    .. '<tbody>' .. table.concat(body) .. '</tbody></table>'
end

--- Renders the tracklist: one table per section, headers between tables.
function p._renderTracklist(tracks, opts)
  opts = opts or {}
  tracks = tracks or {}
  if #tracks == 0 then
    return '<div class="album-track-empty">No tracks available yet</div>'
  end

  local mode = p._groupMode(tracks, opts.groupstyle)
  local columns = p._columns(tracks)

  -- Group is shown as a section header or an in-row badge, not a column,
  -- unless explicitly overridden.
  if mode ~= 'column' then
    for i = #columns, 1, -1 do
      if columns[i] == 'Group' then table.remove(columns, i) end
    end
  end

  local sectioned = (mode == 'section')
  local useFilter
  if opts.tablefilter == 'never' then
    useFilter = false
  elseif opts.tablefilter == 'always' then
    useFilter = true
  else
    useFilter = (not sectioned) and #tracks > FILTER_THRESHOLD
  end

  if not sectioned then
    return '<div class="album-tracklist">'
      .. renderTable(tracks, columns, opts, mode, useFilter)
      .. '</div>'
  end

  local parts = { '<div class="album-tracklist" data-sectioned="true">' }
  for _, section in ipairs(p._sections(tracks)) do
    parts[#parts + 1] = '<div class="album-track-section">'
      .. '<span class="album-track-section-label">' .. section.label .. '</span>'
      .. '<span class="album-track-section-count">' .. #section.tracks .. ' tracks</span>'
      .. '</div>'
    parts[#parts + 1] = renderTable(section.tracks, columns, opts, mode, false)
  end
  parts[#parts + 1] = '</div>'
  return table.concat(parts)
end
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest dev-utils/lua-test/album-render`
Expected: PASS, 12 tests.

- [ ] **Step 5: Run the whole Lua suite**

Run: `npx jest dev-utils/lua-test`
Expected: PASS — all suites from Tasks 1–7.

- [ ] **Step 6: Commit**

```bash
git add wiki/modules/Album.lua dev-utils/lua-test/album-render.test.ts
git commit -m "feat(album): render tracklist with sections, badges and filter gating"
```

---

### Task 8: Render the album card

**Files:**
- Modify: `wiki/modules/Album.lua`
- Test: `dev-utils/lua-test/album-card.test.ts`

**Interfaces:**
- Consumes: `p._clean` (Task 2).
- Produces: `p._renderCard(args: table) -> string` — cover box plus title block plus metadata definition list.

- [ ] **Step 1: Write the failing test**

Create `dev-utils/lua-test/album-card.test.ts`:

```ts
import { loadLuaModule, type LuaModule } from './lua-harness';

const MODULE = 'wiki/modules/Album.lua';

function luaTable(o: Record<string, string>): string {
  return `{${Object.entries(o).map(([k, v]) => `['${k}']=${JSON.stringify(v)}`).join(',')}}`;
}

describe('Module:Album card rendering', () => {
  let m: LuaModule;
  beforeEach(() => {
    m = loadLuaModule(MODULE);
  });

  const card = (o: Record<string, string>) => m.eval(`M._renderCard(${luaTable(o)})`);

  it('renders the album title', () => {
    expect(card({ albumtitle: 'Aoi Kioku', datereleased: '2024-08-14' })).toContain('Aoi Kioku');
  });

  it('prefers albumtitle over the official title fields', () => {
    const html = card({ albumtitle: 'Chosen', officialjaptitle: 'Ignored', datereleased: 'x' });
    expect(html).toContain('Chosen');
    expect(html).not.toContain('Ignored');
  });

  it('falls back through jap, rom, then eng titles', () => {
    expect(card({ officialromtitle: 'Sekai-iro', datereleased: 'x' })).toContain('Sekai-iro');
    expect(card({ officialengtitle: 'Universe', datereleased: 'x' })).toContain('Universe');
  });

  it('emits metadata as a definition list, not bold-labelled divs', () => {
    const html = card({ albumtitle: 'A', datereleased: '2024-08-14', label: 'Balloon Rec.' });
    expect(html).toContain('<dl class="album-meta">');
    expect(html).toContain('<dt>Released</dt><dd>2024-08-14</dd>');
    expect(html).toContain('<dt>Label</dt><dd>Balloon Rec.</dd>');
    expect(html).not.toContain('<strong>Label');
  });

  it('omits metadata rows that have no value', () => {
    const html = card({ albumtitle: 'A', datereleased: '2024-08-14' });
    expect(html).not.toContain('<dt>Label</dt>');
    expect(html).not.toContain('<dt>Featuring</dt>');
  });

  it('renders the cover with an explicit width, not thumb', () => {
    const html = card({ albumtitle: 'A', datereleased: 'x', image: 'cover.png' });
    expect(html).toContain('[[File:cover.png');
    expect(html).toContain('220px');
    expect(html).not.toContain('|thumb');
  });

  it('renders a placeholder when no image is given', () => {
    expect(card({ albumtitle: 'A', datereleased: 'x' })).toContain('Template doc.png');
  });

  it('includes the artist as metadata rather than a caption', () => {
    const html = card({ albumtitle: 'A', datereleased: 'x', image: 'c.png', albumartist: 'Chachagoma' });
    expect(html).toContain('<dt>Artwork</dt><dd>Chachagoma</dd>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest dev-utils/lua-test/album-card`
Expected: FAIL — `attempt to call a nil value (field '_renderCard')`.

- [ ] **Step 3: Write minimal implementation**

Append to `wiki/modules/Album.lua`, before `return p`:

```lua
-- Covers are effectively always 1:1. An explicit pixel width is used instead
-- of |thumb| because thumb size follows each reader's own preference, which
-- is why the current desktop cover can be cropped by overflow:hidden.
local COVER_WIDTH = '220px'

local META_ROWS = {
  { label = 'Released',  key = 'datereleased' },
  { label = 'Label',     key = 'label' },
  { label = 'Featuring', key = 'singers' },
  { label = 'Catalog',   key = 'catalognumber' },
  { label = 'Artwork',   key = 'albumartist' },
}

local function displayTitle(args)
  local title = p._clean(args.albumtitle)
  if title ~= '' then return title end
  for _, key in ipairs({ 'officialjaptitle', 'officialromtitle', 'officialengtitle' }) do
    local v = p._clean(args[key])
    if v ~= '' then return v end
  end
  return '<span class="album-error">albumtitle field must be filled</span>'
end

--- Renders the cover box and the metadata grid.
function p._renderCard(args)
  args = args or {}

  local image = p._clean(args.image)
  if image == '' then image = 'Template doc.png' end
  local link = p._clean(args.imagelink)
  local linkPart = (link ~= '') and ('|link=' .. link) or ''
  local cover = '[[File:' .. image .. '|' .. COVER_WIDTH .. '|alt=' .. displayTitle(args) .. linkPart .. ']]'

  local rows = {}
  for _, row in ipairs(META_ROWS) do
    local value = p._clean(args[row.key])
    if value ~= '' then
      rows[#rows + 1] = '<dt>' .. row.label .. '</dt><dd>' .. value .. '</dd>'
    end
  end

  local sub = {}
  for _, key in ipairs({ 'officialromtitle', 'officialengtitle' }) do
    local v = p._clean(args[key])
    if v ~= '' and v ~= displayTitle(args) then sub[#sub + 1] = v end
  end

  return '<div class="album-row">'
    .. '<div class="album-cover">' .. cover .. '</div>'
    .. '<div class="album-details">'
    .. '<div class="album-title">' .. displayTitle(args) .. '</div>'
    .. (#sub > 0 and ('<div class="album-subtitle">' .. table.concat(sub, ' \194\183 ') .. '</div>') or '')
    .. '<dl class="album-meta">' .. table.concat(rows) .. '</dl>'
    .. '</div></div>'
end
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest dev-utils/lua-test/album-card`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add wiki/modules/Album.lua dev-utils/lua-test/album-card.test.ts
git commit -m "feat(album): render card with fixed cover box and metadata grid"
```

---

### Task 9: Assemble the module entry point

**Files:**
- Modify: `wiki/modules/Album.lua`
- Test: `dev-utils/lua-test/album-main.test.ts`

**Interfaces:**
- Consumes: `p._renderCard` (Task 8), `p._renderTracklist` (Task 7), `p._collectTracks` (Task 4).
- Produces: `p._build(args: table, root: string) -> table` returning `{ card = string, tracklist = string, tabs = table, categories = table }`, where `tabs` is an array of `{ label = string, content = string }` and `categories` is an array of category wikitext strings. `p.main(frame)` wires `_build` to the tabber extension tag.

`_build` is kept free of `frame` so it stays testable; `main` is the only frame-aware function and is covered by the render-parity harness in Task 13 instead.

- [ ] **Step 1: Write the failing test**

Create `dev-utils/lua-test/album-main.test.ts`:

```ts
import { loadLuaModule, type LuaModule } from './lua-harness';

const MODULE = 'wiki/modules/Album.lua';

function luaTable(o: Record<string, string>): string {
  return `{${Object.entries(o).map(([k, v]) => `['${k}']=${JSON.stringify(v)}`).join(',')}}`;
}

describe('Module:Album assembly', () => {
  let m: LuaModule;
  beforeEach(() => {
    m = loadLuaModule(MODULE);
  });

  const build = (o: Record<string, string>, root = 'Test Singer') =>
    `M._build(${luaTable(o)}, ${JSON.stringify(root)})`;

  const base = { albumtitle: 'A', datereleased: '2024-01-01', t1title: 'Melt', t1composer: 'ryo' };

  it('always produces a Tracklist tab first', () => {
    expect(m.eval(`${build(base)}.tabs[1].label`)).toBe('Tracklist');
  });

  it('includes the card', () => {
    expect(m.eval(`${build(base)}.card`)).toContain('album-row');
  });

  it('omits the Cover Art tab when there is no gallery', () => {
    expect(m.eval(`table.concat((function() local t={} for _,x in ipairs(${build(base)}.tabs) do t[#t+1]=x.label end return t end)(), '|')`))
      .not.toContain('Cover Art');
  });

  it('adds the Cover Art tab when a gallery exists', () => {
    const o = { ...base, gallery: '{{Gallery|a.png}}' };
    expect(m.eval(`table.concat((function() local t={} for _,x in ipairs(${build(o)}.tabs) do t[#t+1]=x.label end return t end)(), '|')`))
      .toContain('Cover Art');
  });

  it('adds a YT Crossfade tab only when crossfadeyt is set', () => {
    const labels = (o: Record<string, string>) =>
      m.eval(`table.concat((function() local t={} for _,x in ipairs(${build(o)}.tabs) do t[#t+1]=x.label end return t end)(), '|')`);
    expect(labels(base)).not.toContain('YT Crossfade');
    expect(labels({ ...base, crossfadeyt: 'abc123' })).toContain('YT Crossfade');
  });

  it('threads the root name into the utaite fallback', () => {
    expect(m.eval(`${build(base, 'Mafumafu')}.tracklist`)).toContain('Mafumafu');
  });

  it('renders legacy <tr> passthrough unchanged', () => {
    const o = { albumtitle: 'A', datereleased: 'x', track: '<tr><td>1</td><td>Old</td></tr>' };
    const html = m.eval(`${build(o)}.tracklist`);
    expect(html).toContain('<td>Old</td>');
    expect(html).toContain('album-track-legacy');
  });

  it('adds no categories for a clean album', () => {
    expect(m.eval(`#${build(base)}.categories`)).toBe('0');
  });

  it('categorises an album carrying unrecognised parameters', () => {
    const o = { ...base, itunes: 'x' };
    expect(m.eval(`table.concat(${build(o)}.categories, '')`)).toContain(
      'Album template with unknown parameters',
    );
  });

  it('categorises a page still on legacy Track markup', () => {
    const o = { albumtitle: 'A', datereleased: 'x', track: '<tr><td>1</td></tr>' };
    expect(m.eval(`table.concat(${build(o)}.categories, '')`)).toContain(
      'Album template with legacy tracklist',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest dev-utils/lua-test/album-main`
Expected: FAIL — `attempt to call a nil value (field '_build')`.

- [ ] **Step 3: Write minimal implementation**

Append to `wiki/modules/Album.lua`, before `return p`:

```lua
local LEGACY_COLUMNS = 7

--- Wraps pre-migration {{Track}} markup in a fixed-column table, unchanged.
local function renderLegacy(blob)
  return '<div class="album-tracklist album-track-legacy">'
    .. '<table class="wikitable album-track-table"><tbody>' .. blob .. '</tbody></table>'
    .. '</div>'
end

--- Builds every renderable piece of the album. Frame-free so it stays testable.
function p._build(args, root)
  args = args or {}

  local tracks = p._collectTracks(args)
  local tracklist
  local blob = args.track
  if blob and blob ~= '' and p._isLegacyHtml(blob) then
    tracklist = renderLegacy(blob)
  else
    tracklist = p._renderTracklist(tracks, {
      groupstyle = args.groupstyle,
      tablefilter = args.tablefilter,
      root = root,
    })
  end

  local tabs = {
    { label = 'Tracklist', content = tracklist },
  }

  local gallery = p._clean(args.gallery)
  if gallery ~= '' and p._clean(args.suppressacg) ~= 'true' then
    tabs[#tabs + 1] = { label = 'Cover Art', content = '<div class="album-art">' .. gallery .. '</div>' }
  end

  local jpshops, shops = p._clean(args.jpshops), p._clean(args.shops)
  if jpshops ~= '' or shops ~= '' then
    local parts = { '<div class="album-shops">' }
    if jpshops ~= '' then
      parts[#parts + 1] = '<h4>Japan Only</h4><div class="shop-links">' .. jpshops .. '</div>'
    end
    if shops ~= '' then
      parts[#parts + 1] = '<h4>International</h4><div class="shop-links">' .. shops .. '</div>'
    end
    parts[#parts + 1] = '</div>'
    tabs[#tabs + 1] = { label = 'Shops & Downloads', content = table.concat(parts) }
  end

  local streams, spotify = p._clean(args.streams), p._clean(args.spotifyalbumid)
  if streams ~= '' or spotify ~= '' then
    tabs[#tabs + 1] = {
      label = 'Streaming',
      content = '<div class="album-streams">' .. streams .. '</div>',
    }
  end

  local yt = p._clean(args.crossfadeyt)
  if yt ~= '' then
    tabs[#tabs + 1] = { label = 'YT Crossfade', content = '<div class="album-crossfade">' .. yt .. '</div>' }
  end

  local nnd = p._clean(args.crossfadennd)
  if nnd ~= '' then
    tabs[#tabs + 1] = { label = 'NND Crossfade', content = '<div class="album-crossfade">' .. nnd .. '</div>' }
  end

  -- Maintenance categories. Unknown parameters render nothing, so without
  -- this the long tail of typos stays invisible the way it is today.
  local categories = {}
  if #p._unknownParams(args) > 0 then
    categories[#categories + 1] = '[[Category:Album template with unknown parameters]]'
  end
  if blob and blob ~= '' and p._isLegacyHtml(blob) then
    categories[#categories + 1] = '[[Category:Album template with legacy tracklist]]'
  end

  return {
    card = p._renderCard(args),
    tracklist = tracklist,
    tabs = tabs,
    categories = categories,
  }
end

--- Entry point. The only frame-aware function.
function p.main(frame)
  local args = require('Module:Arguments').getArgs(frame)
  local root = mw.title.getCurrentTitle().rootText
  local built = p._build(args, root)

  local tabber = ''
  for _, tab in ipairs(built.tabs) do
    tabber = tabber .. '|-|' .. tab.label .. '=\n' .. tab.content .. '\n'
  end

  local categories = ''
  if mw.title.getCurrentTitle().namespace == 0 then
    categories = table.concat(built.categories)
  end

  return built.card
    .. frame:extensionTag('tabber', tabber, { class = 'wds-tabber dev-tabber album-tabs' })
    .. categories
end
```

Note `p.main` calls `frame:extensionTag('tabber', …)` directly rather than going through `{{Tabber}}`, avoiding a template round-trip. This mirrors what `Module:Tabber` does.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest dev-utils/lua-test/album-main`
Expected: PASS, 10 tests.

- [ ] **Step 5: Run the full suite for regressions**

Run: `npx jest`
Expected: PASS — 304 existing tests plus everything added in Tasks 2–9.

- [ ] **Step 6: Commit**

```bash
git add wiki/modules/Album.lua dev-utils/lua-test/album-main.test.ts
git commit -m "feat(album): assemble card, tracklist and tabs into module entry point"
```

---

### Task 10: Album CSS

**Files:**
- Modify: `src/gadgets/styling/citizen/citizen-templates.less:113-160` (the `.album-*` block) and the `@media (max-width: 1024px)` block beginning near line 254
- Test: manual visual check (this file has no test coverage today; do not invent a snapshot harness for it)

**Interfaces:**
- Consumes: class names emitted in Tasks 7–9 — `album-row`, `album-cover`, `album-details`, `album-title`, `album-subtitle`, `album-meta`, `album-tracklist`, `album-track-table`, `album-track-n`, `album-track-info`, `album-track-badge`, `album-track-section`, `album-track-section-label`, `album-track-section-count`, `album-track-empty`, `album-track-legacy`.

- [ ] **Step 1: Replace the desktop cover rules**

In `src/gadgets/styling/citizen/citizen-templates.less`, replace the existing `.album-cover` and `.album-cover img` rules:

```less
.album-cover {
    flex: 0 0 auto;
    width: clamp(120px, 22%, 220px);
    aspect-ratio: 1 / 1;
    margin-right: 25px;
    border-radius: 8px;
    overflow: hidden;
}

.album-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    border-radius: 8px;
}
```

The old rules gave `.album-cover` `flex: 1; max-width: 30%; overflow: hidden` with no sizing on the image at all, so a thumbnail wider than the box was silently cropped and the rendered size followed each reader's thumbnail preference.

- [ ] **Step 2: Add the metadata grid**

Replace the `.album-singers, .album-date, .album-label` rule with:

```less
.album-meta {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 5px 14px;
    margin: 10px 0 0;
    font-size: 1em;
}

.album-meta dt {
    color: var(--secondary-text-color);
    font-weight: 400;
    white-space: nowrap;
}

.album-meta dd {
    margin: 0;
    color: var(--primary-text-color);
    min-width: 0;
}

.album-subtitle {
    color: var(--secondary-text-color);
    margin-top: 2px;
}
```

- [ ] **Step 3: Add tracklist rules**

Append to the same album block:

```less
.album-track-table {
    width: 100%;
    table-layout: fixed;
}

.album-track-n {
    width: 3.5em;
    font-variant-numeric: tabular-nums;
    color: var(--secondary-text-color);
}

.album-track-info {
    color: var(--secondary-text-color);
    font-size: .9em;
}

/* Hidden on desktop, where the credit columns carry this information.
   The mobile block below reveals it and hides those columns instead. */
.album-track-credit {
    display: none;
}

.album-track-badge {
    display: inline-block;
    font-size: .8em;
    padding: 1px 7px;
    border-radius: 999px;
    border: 1px solid var(--secondary-text-color);
    color: var(--secondary-text-color);
    white-space: nowrap;
}

.album-track-section {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 8px 10px;
    margin-top: 14px;
    border-top: 1px solid var(--secondary-text-color);
    border-bottom: 1px solid var(--secondary-text-color);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .06em;
    font-size: .85em;
}

.album-track-section-count {
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    color: var(--secondary-text-color);
}
```

`table-layout: fixed` is required: without it each section table sizes its columns from its own content and the credit columns fail to line up between discs.

- [ ] **Step 4: Add the mobile credit-line layout**

Inside the existing `@media screen and (max-width: 1024px)` block:

```less
    .album-track-table thead {
        display: none;
    }

    .album-track-table,
    .album-track-table tbody,
    .album-track-table tr,
    .album-track-table td {
        display: block;
        width: auto;
    }

    .album-track-table tr {
        display: grid;
        grid-template-columns: 2.2em 1fr;
        padding: 9px 4px;
        border-bottom: 1px solid var(--secondary-text-color);
    }

    .album-track-table td {
        padding: 0;
        border: 0;
    }

    .album-track-table td.album-track-n {
        grid-row: 1;
        grid-column: 1;
    }

    .album-track-table td:nth-child(2) {
        grid-row: 1;
        grid-column: 2;
    }

    /* Utaite stays; the separate credit columns collapse into the merged
       credit line that Task 7 embeds in the title cell. */
    .album-track-table td:nth-child(3) {
        grid-column: 2;
        font-size: .9em;
        color: var(--primary-text-color);
    }

    .album-track-table td:nth-child(n + 4) {
        display: none;
    }

    .album-track-credit {
        display: block;
        grid-column: 2;
        font-size: .9em;
        color: var(--secondary-text-color);
    }
```

- [ ] **Step 5: Verify the stylesheet builds**

Run: `npx vite build`
Expected: build completes with no Less errors.

If the build fails with `ERR_PNPM_IGNORED_BUILDS` or a missing esbuild binary, run `pnpm rebuild esbuild` first.

- [ ] **Step 6: Commit**

```bash
git add src/gadgets/styling/citizen/citizen-templates.less
git commit -m "style(album): fixed square cover, metadata grid, adaptive tracklist"
```

---

### Task 11: Group filter bar gadget

**Files:**
- Create: `src/gadgets/core/datatables/album-filter.ts`
- Test: `src/gadgets/core/datatables/album-filter.test.ts`

**Interfaces:**
- Consumes: DOM emitted by Task 7 — a `.album-tracklist[data-sectioned="true"]` containing alternating `.album-track-section` and `table.album-track-table` elements.
- Produces: `initAlbumFilter(root: HTMLElement): void` — injects a chip row and a text input, and shows/hides sections and rows.

This restores what suppressing DataTables would otherwise cost, and does more than searchPanes did: it filters across every section table at once.

- [ ] **Step 1: Write the failing test**

Create `src/gadgets/core/datatables/album-filter.test.ts`:

```ts
import { initAlbumFilter } from './album-filter';

function build(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'album-tracklist';
  root.setAttribute('data-sectioned', 'true');
  root.innerHTML = `
    <div class="album-track-section">
      <span class="album-track-section-label">Disc 1</span>
      <span class="album-track-section-count">2 tracks</span>
    </div>
    <table class="album-track-table"><tbody>
      <tr><td class="album-track-n">1</td><td>Melt</td><td>Soraru</td></tr>
      <tr><td class="album-track-n">2</td><td>Alone</td><td>Mafumafu</td></tr>
    </tbody></table>
    <div class="album-track-section">
      <span class="album-track-section-label">Disc 2</span>
      <span class="album-track-section-count">1 tracks</span>
    </div>
    <table class="album-track-table"><tbody>
      <tr><td class="album-track-n">3</td><td>Fragments</td><td>Soraru</td></tr>
    </tbody></table>`;
  document.body.appendChild(root);
  return root;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('album filter bar', () => {
  it('renders one chip per section plus All', () => {
    const root = build();
    initAlbumFilter(root);
    const chips = root.querySelectorAll('.album-filter-chip');
    expect([...chips].map((c) => c.textContent)).toEqual(['All', 'Disc 1', 'Disc 2']);
  });

  it('shows a total count', () => {
    const root = build();
    initAlbumFilter(root);
    expect(root.querySelector('.album-filter-count')!.textContent).toBe('3 of 3');
  });

  it('hides other sections when a chip is clicked', () => {
    const root = build();
    initAlbumFilter(root);
    const chips = root.querySelectorAll<HTMLElement>('.album-filter-chip');
    chips[2].click();
    const tables = root.querySelectorAll<HTMLElement>('table.album-track-table');
    expect(tables[0].style.display).toBe('none');
    expect(tables[1].style.display).toBe('');
    expect(root.querySelector('.album-filter-count')!.textContent).toBe('1 of 3');
  });

  it('filters rows across every section by text', () => {
    const root = build();
    initAlbumFilter(root);
    const input = root.querySelector<HTMLInputElement>('.album-filter-text')!;
    input.value = 'soraru';
    input.dispatchEvent(new Event('input'));

    const rows = root.querySelectorAll<HTMLElement>('tbody tr');
    expect(rows[0].style.display).toBe('');
    expect(rows[1].style.display).toBe('none');
    expect(rows[2].style.display).toBe('');
    expect(root.querySelector('.album-filter-count')!.textContent).toBe('2 of 3');
  });

  it('hides a section whose rows are all filtered out', () => {
    const root = build();
    initAlbumFilter(root);
    const input = root.querySelector<HTMLInputElement>('.album-filter-text')!;
    input.value = 'fragments';
    input.dispatchEvent(new Event('input'));

    const headers = root.querySelectorAll<HTMLElement>('.album-track-section');
    expect(headers[0].style.display).toBe('none');
    expect(headers[1].style.display).toBe('');
  });

  it('ignores unsectioned tracklists', () => {
    const root = build();
    root.removeAttribute('data-sectioned');
    initAlbumFilter(root);
    expect(root.querySelector('.album-filter-chip')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/gadgets/core/datatables/album-filter`
Expected: FAIL — cannot resolve `./album-filter`.

- [ ] **Step 3: Write minimal implementation**

Create `src/gadgets/core/datatables/album-filter.ts`:

```ts
/**
 * Filter bar for sectioned album tracklists.
 *
 * A sectioned album renders one table per disc and deliberately does not
 * initialise DataTables, because injected section headers would be sorted and
 * filtered as if they were tracks. This restores filtering — and unlike the
 * old searchPanes setup, it spans every section table rather than one.
 */

interface Section {
  header: HTMLElement;
  table: HTMLElement;
  label: string;
  rows: HTMLElement[];
}

function readSections(root: HTMLElement): Section[] {
  const sections: Section[] = [];
  const headers = root.querySelectorAll<HTMLElement>('.album-track-section');

  headers.forEach((header) => {
    let node = header.nextElementSibling;
    while (node && !node.matches('table.album-track-table')) {
      node = node.nextElementSibling;
    }
    if (!node) return;
    const table = node as HTMLElement;
    sections.push({
      header,
      table,
      label: header.querySelector('.album-track-section-label')?.textContent?.trim() ?? '',
      rows: [...table.querySelectorAll<HTMLElement>('tbody tr')],
    });
  });

  return sections;
}

export function initAlbumFilter(root: HTMLElement): void {
  if (root.getAttribute('data-sectioned') !== 'true') return;
  if (root.querySelector('.album-filter')) return;

  const sections = readSections(root);
  if (!sections.length) return;

  const total = sections.reduce((n, s) => n + s.rows.length, 0);

  const bar = document.createElement('div');
  bar.className = 'album-filter';

  const labels = ['All', ...sections.map((s) => s.label)];
  const chips = labels.map((label, i) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'album-filter-chip' + (i === 0 ? ' is-active' : '');
    chip.textContent = label;
    bar.appendChild(chip);
    return chip;
  });

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'album-filter-text';
  input.placeholder = 'Filter titles and credits…';
  bar.appendChild(input);

  const count = document.createElement('span');
  count.className = 'album-filter-count';
  count.textContent = `${total} of ${total}`;
  bar.appendChild(count);

  root.insertBefore(bar, root.firstChild);

  let selected = 'All';

  const apply = (): void => {
    const query = input.value.trim().toLowerCase();
    let shown = 0;

    sections.forEach((section) => {
      const sectionMatches = selected === 'All' || selected === section.label;
      let visibleInSection = 0;

      section.rows.forEach((row) => {
        const text = (row.textContent ?? '').toLowerCase();
        const visible = sectionMatches && (!query || text.indexOf(query) >= 0);
        row.style.display = visible ? '' : 'none';
        if (visible) visibleInSection += 1;
      });

      const showSection = sectionMatches && visibleInSection > 0;
      section.header.style.display = showSection ? '' : 'none';
      section.table.style.display = showSection ? '' : 'none';
      shown += visibleInSection;
    });

    count.textContent = `${shown} of ${total}`;
  };

  chips.forEach((chip, i) => {
    chip.addEventListener('click', () => {
      selected = labels[i];
      chips.forEach((c, j) => c.classList.toggle('is-active', i === j));
      apply();
    });
  });

  input.addEventListener('input', apply);
  apply();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/gadgets/core/datatables/album-filter`
Expected: PASS, 6 tests.

- [ ] **Step 5: Add filter-bar styling**

Append to `src/gadgets/core/datatables/Datatables.less`:

```less
.album-filter {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    padding: 10px 0;
}

.album-filter-chip {
    font: inherit;
    font-size: .85em;
    padding: 4px 10px;
    border-radius: 999px;
    cursor: pointer;
    border: 1px solid var(--secondary-text-color);
    background: transparent;
    color: var(--secondary-text-color);
}

.album-filter-chip.is-active {
    background: var(--primary-text-color);
    color: var(--body-background-color);
    font-weight: 600;
}

.album-filter-text {
    font: inherit;
    font-size: .9em;
    padding: 5px 10px;
    flex: 1;
    min-width: 160px;
    border: 1px solid var(--secondary-text-color);
    border-radius: 6px;
    background: transparent;
    color: var(--primary-text-color);
}

.album-filter-count {
    margin-left: auto;
    font-size: .85em;
    color: var(--secondary-text-color);
}
```

- [ ] **Step 6: Wire it into the datatables entry point**

In `src/gadgets/core/datatables/datatables-helper.ts`, near the existing initialisation that selects `table.dataTable:not(.dataTable-processed), table.datatable:not(.datatable-loaded)` (around line 983), add a sibling call:

```ts
import { initAlbumFilter } from './album-filter';

// …inside the same initialisation routine, after the DataTables pass:
document
  .querySelectorAll<HTMLElement>('.album-tracklist[data-sectioned="true"]')
  .forEach((root) => initAlbumFilter(root));
```

- [ ] **Step 7: Run the full suite**

Run: `npx jest`
Expected: PASS — no regressions.

- [ ] **Step 8: Commit**

```bash
git add src/gadgets/core/datatables/
git commit -m "feat(album): chip and text filter for sectioned tracklists"
```

---

### Task 12: Render-parity harness

**Files:**
- Create: `dev-utils/wiki-audit/album-parity.ts`
- Create: `dev-utils/wiki-audit/album-parity-cli.ts`
- Test: `dev-utils/wiki-audit/album-parity.test.ts`

**Interfaces:**
- Consumes: the read-only client `createClient` from `dev-utils/wiki-audit/lib/api.ts`.
- Produces:
  - `extractTrackFacts(html: string) -> TrackFacts` where `TrackFacts` is `{ count: number; titles: string[] }`.
  - `compare(before: TrackFacts, after: TrackFacts) -> string[]` — a list of human-readable differences, empty when equivalent.

This is the deployment gate. A page whose track set changes is a regression; styling and column changes are expected and are not compared.

- [ ] **Step 1: Write the failing test**

Create `dev-utils/wiki-audit/album-parity.test.ts`:

```ts
import { extractTrackFacts, compare } from './album-parity.ts';

const BEFORE = `
<table class="album-track-table"><tbody>
<tr><td>1</td><td>Melt</td><td>Soraru</td></tr>
<tr><td>2</td><td>Alone</td><td>Mafumafu</td></tr>
</tbody></table>`;

describe('album parity', () => {
  it('counts track rows', () => {
    expect(extractTrackFacts(BEFORE).count).toBe(2);
  });

  it('extracts titles from the second cell', () => {
    expect(extractTrackFacts(BEFORE).titles).toEqual(['Melt', 'Alone']);
  });

  it('ignores header rows', () => {
    const html = `<table class="album-track-table"><thead><tr><th>#</th><th>Title</th></tr></thead>
      <tbody><tr><td>1</td><td>Melt</td></tr></tbody></table>`;
    expect(extractTrackFacts(html).count).toBe(1);
  });

  it('aggregates across multiple tables', () => {
    const html = BEFORE + BEFORE;
    expect(extractTrackFacts(html).count).toBe(4);
  });

  it('reports no differences for equivalent renders', () => {
    expect(compare(extractTrackFacts(BEFORE), extractTrackFacts(BEFORE))).toEqual([]);
  });

  it('reports a count change', () => {
    const after = extractTrackFacts(BEFORE + BEFORE);
    expect(compare(extractTrackFacts(BEFORE), after)[0]).toMatch(/track count 2 -> 4/);
  });

  it('reports a changed title', () => {
    const after = extractTrackFacts(BEFORE.replace('Alone', 'Changed'));
    expect(compare(extractTrackFacts(BEFORE), after)[0]).toMatch(/Alone.*Changed/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest dev-utils/wiki-audit/album-parity`
Expected: FAIL — cannot resolve `./album-parity.ts`.

- [ ] **Step 3: Write minimal implementation**

Create `dev-utils/wiki-audit/album-parity.ts`:

```ts
/**
 * Render-parity gate for the album template migration.
 *
 * Compares the *facts* a tracklist asserts — how many tracks and what they are
 * called — before and after the module cutover. Presentation is expected to
 * change; the track set is not. Read-only: no write method is imported here.
 */

export interface TrackFacts {
  count: number;
  titles: string[];
}

/** Strips tags and collapses whitespace, leaving comparable text. */
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractTrackFacts(html: string): TrackFacts {
  const titles: string[] = [];

  for (const table of html.match(/<table[\s\S]*?<\/table>/gi) ?? []) {
    const bodies = table.match(/<tbody[\s\S]*?<\/tbody>/gi) ?? [table];
    for (const body of bodies) {
      for (const row of body.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
        const cells = row.match(/<td[\s\S]*?<\/td>/gi);
        if (!cells || cells.length < 2) continue;
        titles.push(text(cells[1]));
      }
    }
  }

  return { count: titles.length, titles };
}

export function compare(before: TrackFacts, after: TrackFacts): string[] {
  const diffs: string[] = [];

  if (before.count !== after.count) {
    diffs.push(`track count ${before.count} -> ${after.count}`);
  }

  const n = Math.min(before.titles.length, after.titles.length);
  for (let i = 0; i < n; i++) {
    if (before.titles[i] !== after.titles[i]) {
      diffs.push(`track ${i + 1} title "${before.titles[i]}" -> "${after.titles[i]}"`);
    }
  }

  return diffs;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest dev-utils/wiki-audit/album-parity`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the CLI**

Create `dev-utils/wiki-audit/album-parity-cli.ts`:

```ts
/**
 * Renders every AlbumType2 page twice — as it stands, and against a sandbox
 * module — and reports any page whose track set changes.
 *
 * Requests are issued one at a time with a delay: batching uncached parses of
 * these pages returned HTTP 503 during research.
 */
import { readFile, writeFile } from 'fs/promises';
import { createClient } from './lib/api.ts';
import { extractTrackFacts, compare } from './album-parity.ts';

const UA = 'UtaiteWikiAlbumParity/1.0 (repo tooling; read-only)';
const DELAY_MS = 1500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const client = createClient(process.env.WIKI_API_URL!, UA);
  const titles: string[] = JSON.parse(
    await readFile('.scratch/data/embeddedin-Template_AlbumType2.json', 'utf8'),
  );

  const failures: { page: string; diffs: string[] }[] = [];

  for (const [i, page] of titles.entries()) {
    const current = await client.query({ action: 'parse', page, prop: 'text' });
    await sleep(DELAY_MS);

    const source = await client.query({
      action: 'query',
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      titles: page,
    });
    const wikitext: string = source.query.pages[0].revisions[0].slots.main.content;

    const candidate = await client.query({
      action: 'parse',
      title: page,
      text: wikitext.replace(/\{\{\s*AlbumType2/g, '{{AlbumType2/sandbox'),
      prop: 'text',
      contentmodel: 'wikitext',
    });
    await sleep(DELAY_MS);

    const diffs = compare(
      extractTrackFacts(current.parse.text),
      extractTrackFacts(candidate.parse.text),
    );
    if (diffs.length) failures.push({ page, diffs });

    console.log(`[${i + 1}/${titles.length}] ${page} ${diffs.length ? 'DIFF' : 'ok'}`);
  }

  await writeFile('album-parity.json', JSON.stringify(failures, null, 1));
  console.log(`\n${failures.length} of ${titles.length} pages differ`);
  if (failures.length) process.exitCode = 1;
}

await main();
```

- [ ] **Step 6: Commit**

```bash
git add dev-utils/wiki-audit/album-parity.ts dev-utils/wiki-audit/album-parity-cli.ts dev-utils/wiki-audit/album-parity.test.ts
git commit -m "test(album): render-parity gate for the template migration"
```

---

### Task 13: Sandbox deployment and parity run

**Files:**
- Wiki: `Module:Album` (create), `Template:AlbumType2/sandbox` (create)
- No repo files change in this task.

**Interfaces:**
- Consumes: `wiki/modules/Album.lua` (Tasks 2–9), `album-parity-cli.ts` (Task 12).

This is the first task that touches the wiki. It creates only new pages — nothing live changes.

- [ ] **Step 1: Copy the module to the wiki**

Create `Module:Album` on the wiki with the exact contents of `wiki/modules/Album.lua`. Do this by hand in the wiki editor; this repo's tooling is read-only by design.

- [ ] **Step 2: Create the sandbox template**

Create `Template:AlbumType2/sandbox` containing exactly:

```
<includeonly>{{#invoke:Album|main}}</includeonly><noinclude>Sandbox for [[Template:AlbumType2]]. Do not transclude in article space.</noinclude>
```

- [ ] **Step 3: Smoke-test one album by hand**

On `Template:AlbumType2/sandbox/testcases`, transclude the sandbox with a small hand-written album using the `t1*` dialect, and confirm it renders a card and a tracklist without Lua errors.

- [ ] **Step 4: Refresh the page list**

Run: `node --env-file=.env .scratch/fetch-at2.ts`
Expected: writes `.scratch/data/embeddedin-Template_AlbumType2.json` with ~166 titles.

- [ ] **Step 5: Run the parity gate**

Run: `node --env-file=.env dev-utils/wiki-audit/album-parity-cli.ts`
Expected: `0 of 166 pages differ`.

This takes roughly 8 minutes at the 1.5s delay. Do not lower the delay.

- [ ] **Step 6: Fix and repeat**

For every page reported in `album-parity.json`, determine whether the module lost tracks or the harness mis-parsed. Fix the module, re-run the Lua tests, re-copy to the wiki, and re-run the gate until it reports zero.

- [ ] **Step 7: Commit any module fixes**

```bash
git add wiki/modules/Album.lua dev-utils/lua-test/
git commit -m "fix(album): resolve render-parity differences found on live pages"
```

---

### Task 14: Cutover

**Files:**
- Wiki: `Template:Track` (modify), `Template:AlbumType2` (modify)
- Modify: `wiki/templates/Track.wikitext`, `wiki/templates/AlbumType2.wikitext` (repo mirrors)

**Interfaces:**
- Consumes: a green parity run from Task 13.

- [ ] **Step 1: Update the repo mirror of Template:Track**

Replace the contents of `wiki/templates/Track.wikitext` with:

```
<includeonly>{{#if:{{{title|}}}|&#30;{{{1|}}}&#31;{{{title|}}}&#31;{{{additionalshortinfo|}}}&#31;{{{utaite|{{{singers|}}}}}}&#31;{{{lyricist|}}}&#31;{{{composer|}}}&#31;{{{arranger|}}}&#31;{{{group|}}}}}</includeonly><noinclude>
{{doc}}</noinclude>
```

The old version emitted `<tr><td>…</td></tr>` directly, which is why `{{AlbumType2}}` could not render without it.

- [ ] **Step 2: Update the repo mirror of Template:AlbumType2**

Replace the contents of `wiki/templates/AlbumType2.wikitext` with:

```
<includeonly>{{#invoke:Album|main}}{{Main other|[[Category:Singers with Albums or Singles]]|}}{{#ifeq:{{{type|}}}|collab|{{#invoke:Bucket|put
|collab_albums
|album_name = {{#invoke:Sanitize|strip_links|{{{albumtitle|}}}}}
|album_display = {{#invoke:Sanitize|strip_links|{{{albumtitle|}}}}}
|album_label = {{FULLPAGENAMEE}}
|release_text = {{{datereleased|}}}
|release_date = {{{datereleased|}}}
|year = {{#if:{{{datereleased|}}}|{{#time: Y | {{{datereleased}}} }}|}}
|year-type = int
|cover_image = {{{image|}}}
}}|}}</includeonly><noinclude>{{documentation}}</noinclude>
```

The Bucket call is carried over unchanged — it is a non-goal to alter collab-album indexing.

- [ ] **Step 3: Commit the mirrors before touching the wiki**

```bash
git add wiki/templates/Track.wikitext wiki/templates/AlbumType2.wikitext
git commit -m "feat(album): Track emits records, AlbumType2 invokes Module:Album"
```

- [ ] **Step 4: Apply Template:Track on the wiki**

Save `Template:Track` with the Step 1 content. Cached pages still render correctly via the legacy `<tr>` passthrough in `p._build`, so ordering between this and Step 5 does not matter.

- [ ] **Step 5: Apply Template:AlbumType2 on the wiki**

Save `Template:AlbumType2` with the Step 2 content.

- [ ] **Step 6: Spot-check the five reference pages**

Open and confirm each renders correctly, at desktop width and at 380px:

- `Yuikonnu/Discography` — 33 albums, 234 rows
- `Mafumafu/Discography/2021-2025` — 世会色ユニバース, 44 tracks across 3 discs, chips present
- a page containing `Irregular record` — interleaved edition tags render as badges
- `Soraru/Discography/2016-2020` — indirect transclusion
- any single-track release

- [ ] **Step 7: Re-run the parity gate against live**

Run: `node --env-file=.env dev-utils/wiki-audit/album-parity-cli.ts`
Expected: `0 of 166 pages differ` (now comparing live against sandbox, so this confirms the cutover changed nothing factual).

---

### Task 15: Deploy the front-end and measure

**Files:**
- No new files. Deploys Tasks 10–11 and verifies the §7 performance budget.

**Interfaces:**
- Consumes: the CSS from Task 10 and the gadget from Task 11.

- [ ] **Step 1: Build**

Run: `npx vite build`
Expected: build succeeds.

- [ ] **Step 2: Sync to the wiki**

Run: `node dev-sync/sync.ts`
Expected: the album styles and the datatables gadget upload successfully.

- [ ] **Step 3: Measure parser cost on the two reference pages**

Run: `node --env-file=.env .scratch/limit1.ts "MARiA/Discography"`
Run: `node --env-file=.env .scratch/limit1.ts "Yuikonnu/Discography"`

Record `limitreport-cputime`, `scribunto-limitreport-timeusage` and `scribunto-limitreport-memusage`.

Targets from the spec:

| Metric | Baseline | Target |
|---|---|---|
| `Yuikonnu/Discography` CPU | 2.090 s | < 1.5 s |
| Lua time, heaviest page | 1.144 s | < 4 s |
| Lua memory, heaviest page | 1.45 MB | < 15 MB |

`MARiA/Discography` still uses `Template:Album` at this point, so its 8.095 s baseline is unchanged until Album is redirected. Record it for later comparison; do not treat it as a failure.

- [ ] **Step 4: Count DataTables instances on the heaviest page**

In the browser console on `Yuikonnu/Discography`:

```js
document.querySelectorAll('table.dataTable').length
```

Expected: 3 or fewer, against a baseline of 23.

- [ ] **Step 5: Verify the maintenance categories populate**

Confirm `Category:Album template with unknown parameters` lists pages. This is the mechanism for finding the long tail of typos beyond the mapped set.

- [ ] **Step 6: Commit the measurements**

Append the recorded numbers to the spec under §7 as an "Actual" column, then:

```bash
git add docs/superpowers/specs/2026-08-30-album-template-unification-design.md
git commit -m "docs(album): record post-deployment parser measurements"
```

---

## Deferred to a follow-up plan

The spec's §9 step 7 — redirecting `Template:Album` and re-running parity against its 350 pages — is **not** in this plan. It changes the appearance of 350 pages at once and drops portable-infobox theming, and it should only start once AlbumType2 has been stable on the new engine. Write it as its own plan.

Also deferred, from the spec's open questions:

- Migrating the 7 loose `{{Track}}` calls and ~16 non-mainspace usages, which will render as raw records after Task 14.
- Assigning an owner to the maintenance categories.
