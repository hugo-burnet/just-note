export type IconName =
  | 'library'
  | 'discover'
  | 'settings'
  | 'plus'
  | 'paste'
  | 'search'
  | 'close'
  | 'check'
  | 'chevronLeft'
  | 'chevronRight'
  | 'arrowRight'
  | 'play'
  | 'refresh'
  | 'trash'
  | 'sort'
  | 'more'
  | 'link'
  | 'book'
  | 'download'
  | 'downloaded'
  | 'upload';

// One consistent set, drawn on a 24px grid with round caps.
const PATHS: Record<IconName, readonly string[]> = {
  download: ['M12 3v12', 'M7 10l5 5 5-5', 'M4 16v4h16v-4'],
  downloaded: ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z', 'M12 7.5v7', 'M8.75 11.5L12 14.75l3.25-3.25'],
  upload: ['M12 15V3', 'M7 8l5-5 5 5', 'M4 16v4h16v-4'],
  library: ['M4 4.5h4v15H4z', 'M10 4.5h4v15h-4z', 'M15.2 6l3.6-1 3.3 12.6-3.6 1z'],
  discover: ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z', 'M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z'],
  settings: ['M4 7h9', 'M17 7h3', 'M4 17h3', 'M11 17h9', 'M13 4.8v4.4', 'M7 14.8v4.4'],
  plus: ['M12 5v14', 'M5 12h14'],
  paste: ['M9 3.5h6a1 1 0 0 1 1 1V6H8V4.5a1 1 0 0 1 1-1z', 'M8 4.5H6.5A1.5 1.5 0 0 0 5 6v13a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V6a1.5 1.5 0 0 0-1.5-1.5H16'],
  search: ['M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z', 'M20 20l-4-4'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  chevronLeft: ['M14.5 5.5L8 12l6.5 6.5'],
  chevronRight: ['M9.5 5.5L16 12l-6.5 6.5'],
  arrowRight: ['M4.5 12h15', 'M13.5 6l6 6-6 6'],
  play: ['M8 5.2v13.6a.6.6 0 0 0 .9.5l11-6.8a.6.6 0 0 0 0-1l-11-6.8a.6.6 0 0 0-.9.5z'],
  refresh: ['M19.5 11A7.5 7.5 0 1 0 17.3 16.8', 'M19.5 4.5V11H13'],
  trash: ['M4.5 7h15', 'M9.5 3.5h5', 'M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12', 'M10 11v5', 'M14 11v5'],
  sort: ['M7.5 4.5v15', 'M7.5 19.5l-3-3', 'M7.5 19.5l3-3', 'M16.5 19.5v-15', 'M16.5 4.5l-3 3', 'M16.5 4.5l3 3'],
  more: ['M5 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0', 'M11 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0', 'M17 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0'],
  link: ['M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-.8.8', 'M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l.8-.8'],
  book: ['M12 6.5C10.3 5 7.5 4.5 4 4.8v13c3.5-.3 6.3.2 8 1.7 1.7-1.5 4.5-2 8-1.7v-13c-3.5-.3-6.3.2-8 1.7z', 'M12 6.5v13'],
};

const SVG_NS = 'http://www.w3.org/2000/svg';

export function icon(name: IconName, size = 22, options: { filled?: boolean } = {}): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const attributes: Record<string, string> = {
    viewBox: '0 0 24 24',
    width: String(size),
    height: String(size),
    fill: options.filled ? 'currentColor' : 'none',
    stroke: 'currentColor',
    'stroke-width': '1.75',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  };
  for (const [key, value] of Object.entries(attributes)) svg.setAttribute(key, value);
  for (const d of PATHS[name]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
