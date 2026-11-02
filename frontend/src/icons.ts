// Small local SVGs: no icon package, font download or runtime icon registry.
export type IconName =
  | 'plus'
  | 'minus'
  | 'check'
  | 'menu'
  | 'navigate'
  | 'bookmark'
  | 'more'
  | 'heart'
  | 'arrow-left'
  | 'arrow-right'
  | 'arrow-up-right'
  | 'pin'
  | 'locate'
  | 'close'
  | 'chevron-down'
  | 'search'
  | 'list';
const paths: Record<IconName, string> = {
  search: 'M21 21l-5-5M18 10a8 8 0 1 0-16 0 8 8 0 0 0 16 0',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'm5 12 4 4L19 6',
  close: 'M6 6l12 12M18 6 6 18',
  'chevron-down': 'm6 9 6 6 6-6',
  list: 'M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01',
  locate:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3m0 14v3M2 12h3m14 0h3M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  navigate: 'm21 3-7 18-4-7-7-4L21 3Z',
  bookmark: 'M6 4h12v17l-6-4-6 4V4Z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  heart:
    'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  'arrow-left': 'M19 12H5m7-7-7 7 7 7',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'arrow-up-right': 'M7 17 17 7M7 7h10v10',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM9 10a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
};
export function icon(name: IconName): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg',
    svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', name === 'more' ? '3' : '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('ui-icon');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', paths[name]);
  svg.append(path);
  return svg;
}
