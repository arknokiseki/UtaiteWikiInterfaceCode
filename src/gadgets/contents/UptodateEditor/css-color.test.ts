import { isHexColor, isCssColor, classifyColor, describeColor } from './css-color.js';

describe('isHexColor — matches core.is_hex exactly', () => {
  test.each(['#A97A3F', '#a97a3f', 'A97A3F', '  #fde589  '])('accepts %s', (v) => {
    expect(isHexColor(v)).toBe(true);
  });

  // core.is_hex is ^#?%x%x%x%x%x%x$ — six digits, no more, no less.
  test.each(['#fff', '#ffff', '#ffffffff', 'magenta', 'var(--primary-color)', 'rgb(1 2 3)', ''])(
    'rejects %s', (v) => { expect(isHexColor(v)).toBe(false); }
  );
});

describe('isCssColor — the widened allowlist', () => {
  test.each([
    '#fff',
    '#ffff',
    '#a97a3f',
    '#a97a3fcc',
    'magenta',
    'rebeccapurple',
    'transparent',
    'currentColor',
    'var(--primary-color)',
    'var(--primary-color, #c3e6f9)',
    'rgb(169 122 63)',
    'rgba(169,122,63,0.5)',
    'hsl(30 46% 45%)'
  ])('accepts %s', (v) => { expect(isCssColor(v)).toBe(true); });

  test.each([
    '',
    '   ',
    'red;background:url(//evil.example/x)',
    'expression(alert(1))',
    'url(//evil.example/x)',
    'red"onload="x',
    'red<script>',
    'var(--x)}',
    'JAVASCRIPT:alert(1)'
  ])('rejects hostile or malformed %s', (v) => { expect(isCssColor(v)).toBe(false); });
});

describe('classifyColor', () => {
  test('empty', () => { expect(classifyColor('  ')).toBe('empty'); });
  test('hex takes precedence over css', () => { expect(classifyColor('#a97a3f')).toBe('hex'); });

  // The two real live pages that render as default today.
  test('magenta (Chogakusei) is css, not hex', () => {
    expect(classifyColor('magenta')).toBe('css');
  });
  test('var(--primary-color) (Chrono Reverse) is css, not hex', () => {
    expect(classifyColor('var(--primary-color)')).toBe('css');
  });

  test('garbage is invalid', () => { expect(classifyColor('not a colour!')).toBe('invalid'); });
});

describe('describeColor', () => {
  test('says nothing for an empty value', () => {
    expect(describeColor('')).toBe('');
  });
  test('warns that an unrecognised value falls back to the default', () => {
    expect(describeColor('not a colour!')).toContain('ignored');
  });
  test('flags that css values need the module patch', () => {
    expect(describeColor('magenta')).toContain('patch');
  });
  test('explains the fade for hex', () => {
    expect(describeColor('#a97a3f')).toContain('30 months');
  });
});
