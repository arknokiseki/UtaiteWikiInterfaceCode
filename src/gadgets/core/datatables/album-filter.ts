/**
 * Filter bar for sectioned album tracklists.
 *
 * A sectioned album renders one table per disc and deliberately does not
 * initialise DataTables, because injected section headers would be sorted and
 * filtered as if they were tracks, and the RowGroup extension is not bundled
 * here. This restores filtering — and unlike the searchPanes setup it
 * replaces, it spans every section table rather than one.
 */

interface Section {
  header: HTMLElement;
  table: HTMLElement;
  label: string;
  rows: HTMLElement[];
}

/** Pairs each section header with the table that follows it. */
function readSections(root: HTMLElement): Section[] {
  const sections: Section[] = [];

  root.querySelectorAll<HTMLElement>('.album-track-section').forEach((header) => {
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
