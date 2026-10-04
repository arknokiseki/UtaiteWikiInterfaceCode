/**
 * Skeleton placeholders and spinners for content that gadgets fetch after page load.
 *
 * Everything here is a pure builder or acts only on the element it is handed:
 * nothing queries the page or registers hooks, so loading this on every page
 * costs nothing where no gadget calls it.
 */

export interface LineOptions {
  /** Any CSS width, e.g. "60%" or "8em". Defaults to the full width. */
  width?: string;
}

export interface TextOptions {
  /** Number of lines. Defaults to 3. */
  lines?: number;
  /** Width of the last line, so the block reads as a paragraph. Defaults to "60%". */
  lastLineWidth?: string;
}

export interface ShowOptions {
  /**
   * Milliseconds to wait before the placeholder appears. Requests that finish
   * sooner never show it, which avoids a flash on fast responses. Defaults to 200.
   */
  delay?: number;
  /** Screen reader text announced while loading. Defaults to "Loading…". */
  label?: string;
  /** Put the placeholder before the target's existing children rather than after. */
  prepend?: boolean;
}

export interface SkeletonHandle {
  /** Removes the placeholder (or cancels it if it has not appeared yet). Safe to call twice. */
  done: () => void;
}

const DEFAULT_DELAY = 200;
const DEFAULT_LABEL = 'Loading…';

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function toCssLength(value: number | string): string {
  return typeof value === 'number' ? value + 'px' : value;
}

function bone(modifier: string, style: string): string {
  return '<span class="uw-skeleton uw-skeleton--' + modifier + '" aria-hidden="true"' +
    (style ? ' style="' + escapeAttr(style) + '"' : '') + '></span>';
}

/** One line of text-height placeholder. Sits inline, so it can stand in for a word or a timestamp. */
export function line(options: LineOptions = {}): string {
  return bone('text', options.width ? 'width:' + options.width : '');
}

/** A stack of text lines with a shorter last line. */
export function text(options: TextOptions = {}): string {
  const count = Math.max(1, Math.floor(options.lines ?? 3));
  const last = options.lastLineWidth ?? '60%';
  let html = '';
  for (let i = 0; i < count; i++) {
    html += bone('text', i === count - 1 && count > 1 ? 'width:' + last : '');
  }
  return '<span class="uw-skeleton-stack" aria-hidden="true">' + html + '</span>';
}

/** A round placeholder, for avatars. */
export function circle(size: number | string): string {
  const s = toCssLength(size);
  return bone('circle', 'width:' + s + ';height:' + s);
}

/** A rectangular placeholder, for images, embeds and cards. */
export function block(height: number | string, width?: number | string): string {
  return bone('block', 'height:' + toCssLength(height) + (width !== undefined ? ';width:' + toCssLength(width) : ''));
}

/**
 * A FontAwesome spinner, for short waits whose result has no predictable shape.
 * fa-spin already stops for prefers-reduced-motion.
 */
export function spinner(label: string = DEFAULT_LABEL): string {
  return '<span class="uw-spinner" role="status">' +
    '<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i>' +
    '<span class="uw-skeleton-sr">' + escapeAttr(label) + '</span>' +
  '</span>';
}

/**
 * Shows `html` (built from the helpers above) inside `target` after a short delay,
 * marking the target busy for assistive technology. Call `done()` when the real
 * content is ready, before or after inserting it.
 */
export function show(target: Element, html: string, options: ShowOptions = {}): SkeletonHandle {
  const delay = Math.max(0, options.delay ?? DEFAULT_DELAY);
  const label = options.label ?? DEFAULT_LABEL;
  let group: HTMLElement | null = null;
  let finished = false;

  let timer: ReturnType<typeof setTimeout> | null = null;

  target.setAttribute('aria-busy', 'true');

  const insert = (): void => {
    timer = null;
    if (finished) return;
    group = document.createElement('div');
    group.className = 'uw-skeleton-group';
    group.setAttribute('role', 'status');
    group.innerHTML = '<span class="uw-skeleton-sr">' + escapeAttr(label) + '</span>' + html;
    if (options.prepend) {
      target.insertBefore(group, target.firstChild);
    } else {
      target.appendChild(group);
    }
  };

  if (delay === 0) {
    insert();
  } else {
    timer = setTimeout(insert, delay);
  }

  return {
    done: function(): void {
      if (finished) return;
      finished = true;
      if (timer !== null) clearTimeout(timer);
      if (group && group.parentNode) group.parentNode.removeChild(group);
      target.removeAttribute('aria-busy');
    }
  };
}
