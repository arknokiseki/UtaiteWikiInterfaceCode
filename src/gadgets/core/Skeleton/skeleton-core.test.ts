import { line, text, circle, block, spinner, show } from './skeleton-core.js';

function frag(html: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

afterEach(() => {
  document.body.innerHTML = '';
  jest.useRealTimers();
});

describe('builders', () => {
  it('line is a hidden text bone with an optional width', () => {
    const el = frag(line({ width: '6em' })).firstElementChild as HTMLElement;
    expect(el.className).toBe('uw-skeleton uw-skeleton--text');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.style.width).toBe('6em');
    expect((frag(line()).firstElementChild as HTMLElement).hasAttribute('style')).toBe(false);
  });

  it('text stacks lines and shortens only the last', () => {
    const bones = frag(text({ lines: 3, lastLineWidth: '40%' })).querySelectorAll<HTMLElement>('.uw-skeleton--text');
    expect(bones).toHaveLength(3);
    expect([...bones].map((b) => b.style.width)).toEqual(['', '', '40%']);
  });

  it('a single text line keeps full width', () => {
    const bones = frag(text({ lines: 1 })).querySelectorAll<HTMLElement>('.uw-skeleton--text');
    expect(bones).toHaveLength(1);
    expect(bones[0].style.width).toBe('');
  });

  it('circle and block accept numbers as px and strings as-is', () => {
    const c = frag(circle(44)).firstElementChild as HTMLElement;
    expect([c.style.width, c.style.height]).toEqual(['44px', '44px']);
    const b = frag(block('10em', 120)).firstElementChild as HTMLElement;
    expect([b.style.height, b.style.width]).toEqual(['10em', '120px']);
  });

  it('escapes widths so they cannot break out of the style attribute', () => {
    const el = frag(line({ width: '1px" onmouseover="x' })).firstElementChild as HTMLElement;
    expect(el.hasAttribute('onmouseover')).toBe(false);
  });

  it('spinner uses FontAwesome and announces its label', () => {
    const root = frag(spinner('Fetching'));
    expect(root.querySelector('i.fa-solid.fa-circle-notch.fa-spin')).not.toBeNull();
    expect(root.querySelector('[role="status"] .uw-skeleton-sr')!.textContent).toBe('Fetching');
  });
});

describe('show', () => {
  it('waits for the delay, then inserts a labelled status group', () => {
    jest.useFakeTimers();
    const target = document.body.appendChild(document.createElement('div'));
    show(target, line(), { label: 'Loading posts…' });
    expect(target.getAttribute('aria-busy')).toBe('true');
    expect(target.querySelector('.uw-skeleton-group')).toBeNull();
    jest.advanceTimersByTime(200);
    const group = target.querySelector('.uw-skeleton-group')!;
    expect(group.getAttribute('role')).toBe('status');
    expect(group.querySelector('.uw-skeleton-sr')!.textContent).toBe('Loading posts…');
    expect(group.querySelector('.uw-skeleton--text')).not.toBeNull();
  });

  it('never shows the placeholder when done() comes before the delay', () => {
    jest.useFakeTimers();
    const target = document.body.appendChild(document.createElement('div'));
    const handle = show(target, line());
    handle.done();
    jest.advanceTimersByTime(1000);
    expect(target.innerHTML).toBe('');
    expect(target.hasAttribute('aria-busy')).toBe(false);
  });

  it('done() removes the placeholder and is safe to call twice', () => {
    const target = document.body.appendChild(document.createElement('div'));
    target.innerHTML = '<p>kept</p>';
    const handle = show(target, line(), { delay: 0, prepend: true });
    expect(target.firstElementChild!.className).toBe('uw-skeleton-group');
    handle.done();
    handle.done();
    expect(target.innerHTML).toBe('<p>kept</p>');
    expect(target.hasAttribute('aria-busy')).toBe(false);
  });
});
