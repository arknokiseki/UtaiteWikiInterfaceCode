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
