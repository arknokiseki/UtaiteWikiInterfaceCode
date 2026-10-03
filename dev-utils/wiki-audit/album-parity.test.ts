// Imported without a .ts extension: this file is only ever run by Jest, never
// executed directly by Node, so it does not need the allowImportingTsExtensions
// override that the directly-executed wiki-audit CLIs rely on.
import { extractTrackFacts, compare } from './album-parity';

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

  it('strips markup from titles so styling changes do not register', () => {
    const html = `<table class="album-track-table"><tbody><tr><td>1</td>
      <td><a href="/wiki/Melt">Melt</a></td>
    </tr></tbody></table>`;
    expect(extractTrackFacts(html).titles).toEqual(['Melt']);
  });

  it('ignores decoration the new renderer folds into the title cell', () => {
    // The old markup carried info in its own Details column and had no credit
    // line at all, so counting these would flag every track as renamed.
    const oldCell = `<table class="album-track-table"><tbody><tr><td>1</td><td>Melt</td><td>TV size</td></tr></tbody></table>`;
    const newCell = `<table class="album-track-table"><tbody><tr><td>1</td><td>Melt<span class="album-track-info">TV size</span><span class="album-track-credit">lyrics, music: ryo</span></td><td>ryo</td></tr></tbody></table>`;
    expect(extractTrackFacts(newCell).titles).toEqual(['Melt']);
    expect(compare(extractTrackFacts(oldCell), extractTrackFacts(newCell))).toEqual([]);
  });

  it('ignores a group badge folded into the title cell', () => {
    const html = `<table class="album-track-table"><tbody><tr><td>1</td><td>Melt <span class="album-track-badge">Type A</span></td></tr></tbody></table>`;
    expect(extractTrackFacts(html).titles).toEqual(['Melt']);
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

  it('treats a dropped track as a regression, not a reordering', () => {
    const after = extractTrackFacts(`
<table class="album-track-table"><tbody><tr><td>1</td><td>Melt</td><td>Soraru</td></tr></tbody></table>`);
    const diffs = compare(extractTrackFacts(BEFORE), after);
    expect(diffs.some((d) => /track count 2 -> 1/.test(d))).toBe(true);
  });

  it('ignores tables that are not album tracklists', () => {
    // Shop, streaming and navbox markup all render as tables and all changed
    // shape in the rewrite. Counting them made four pages look like they had
    // lost tracks when their tracklists were byte-identical.
    const html = `
      <table class="album-track-table"><tbody>
        <tr><td>1</td><td>Melt</td></tr>
      </tbody></table>
      <table class="wikitable navbox"><tbody>
        <tr><td>Shops</td><td>Animate</td></tr>
        <tr><td>Streams</td><td>Spotify</td></tr>
      </tbody></table>`;
    expect(extractTrackFacts(html).count).toBe(1);
    expect(extractTrackFacts(html).titles).toEqual(['Melt']);
  });

  it('still reads a tracklist carrying extra classes', () => {
    const html = `<table class="wikitable dataTable album-track-table" data-page-length="25"><tbody>
      <tr><td>1</td><td>Melt</td></tr></tbody></table>`;
    expect(extractTrackFacts(html).count).toBe(1);
  });
});
