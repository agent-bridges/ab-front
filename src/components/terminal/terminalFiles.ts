const COMMON_FILE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'heic', 'heif', 'avif',
  'pdf', 'txt', 'md', 'json', 'yaml', 'yml', 'toml', 'xml', 'csv', 'log',
  'kt', 'kts', 'java', 'go', 'rs', 'py', 'js', 'jsx', 'ts', 'tsx', 'css', 'html',
  'zip', 'tar', 'gz', 'tgz', '7z', 'rar', 'apk', 'aab', 'doc', 'docx', 'xls', 'xlsx',
  'mp3', 'wav', 'ogg', 'm4a', 'mp4', 'mkv', 'mov', 'webm', 'sh', 'sql',
]);

const PREVIEWABLE_IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'heic', 'heif', 'avif',
]);

const LEADING_PUNCTUATION = new Set(['(', '[', '{', ':']);
const TRAILING_PUNCTUATION = new Set([')', ']', '}', '.', ',', ';', ':', '!', '?']);

export interface TerminalFileLink {
  path: string;
  start: number;
  end: number;
}

function isPathBoundary(character: string) {
  return /\s/.test(character) || character === '<' || character === '>' || character === '"' || character === "'" || character === '`';
}

function isUnescapedPathBoundary(text: string, index: number) {
  if (!isPathBoundary(text[index])) return false;
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) slashes += 1;
  return slashes % 2 === 0;
}

function quotedRangeContaining(text: string, offset: number): [number, number] | null {
  for (const quote of ["'", '"']) {
    const left = text.lastIndexOf(quote, offset);
    if (left < 0) continue;
    const right = text.indexOf(quote, Math.max(offset + 1, left + 1));
    if (right > left && offset > left && offset < right) return [left + 1, right];
  }
  return null;
}

function markdownRangeContaining(text: string, offset: number): [number, number] | null {
  const marker = text.lastIndexOf('](', offset);
  if (marker < 0) return null;
  const left = marker + 2;
  const right = text.indexOf(')', Math.max(offset + 1, left));
  return right > left && offset >= left && offset < right ? [left, right] : null;
}

function unescapeShellPath(value: string) {
  let result = '';
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      result += character;
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else {
      result += character;
    }
  }
  return escaped ? `${result}\\` : result;
}

function looksLikeFilePath(value: string) {
  if (!value || /[\0\r\n]/.test(value) || value.includes('://')) return false;
  if (value.startsWith('/') || value.startsWith('./') || value.startsWith('../') || value.startsWith('~/')) return true;
  if (value.includes('/')) return true;
  const extension = value.includes('.') ? value.slice(value.lastIndexOf('.') + 1).toLowerCase() : '';
  return extension.length >= 1 && extension.length <= 10 && /^[a-z0-9]+$/.test(extension) && COMMON_FILE_EXTENSIONS.has(extension);
}

export function filePathAt(text: string, offset: number): TerminalFileLink | null {
  if (offset < 0 || offset >= text.length) return null;

  const enclosed = quotedRangeContaining(text, offset) ?? markdownRangeContaining(text, offset);
  if (!enclosed && isPathBoundary(text[offset])) return null;
  let start = enclosed?.[0] ?? offset;
  let end = enclosed?.[1] ?? offset + 1;
  if (!enclosed) {
    while (start > 0 && !isUnescapedPathBoundary(text, start - 1)) start -= 1;
    while (end < text.length && !isUnescapedPathBoundary(text, end)) end += 1;
  }

  while (start < end && LEADING_PUNCTUATION.has(text[start])) start += 1;
  while (end > start && TRAILING_PUNCTUATION.has(text[end - 1])) end -= 1;
  if (offset < start || offset >= end) return null;

  let value = text.slice(start, end).replace(/:\d+(?::\d+)?$/, '');
  if (/^file:\/\//i.test(value)) {
    try { value = new URL(value).pathname; } catch { value = ''; }
  }
  value = unescapeShellPath(value);
  if (!looksLikeFilePath(value)) return null;
  return { path: value, start, end };
}

export function findTerminalFileLinks(text: string): TerminalFileLink[] {
  const links = new Map<string, TerminalFileLink>();
  for (let offset = 0; offset < text.length; offset += 1) {
    const link = filePathAt(text, offset);
    if (link) links.set(`${link.start}:${link.end}`, link);
  }
  return [...links.values()].sort((left, right) => left.start - right.start);
}

export function normalizePosixPath(path: string): string {
  const prefix = path.startsWith('/') ? '/' : path === '~' || path.startsWith('~/') ? '~/' : '';
  const body = prefix === '/' ? path.slice(1) : prefix === '~/' ? path.replace(/^~\/?/, '') : path;
  const parts: string[] = [];
  for (const part of body.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length && parts[parts.length - 1] !== '..') parts.pop();
      else if (!prefix) parts.push(part);
    } else {
      parts.push(part);
    }
  }
  if (prefix === '/') return `/${parts.join('/')}` || '/';
  if (prefix === '~/') return parts.length ? `~/${parts.join('/')}` : '~';
  return parts.join('/');
}

export function resolveTerminalFilePath(rawPath: string, cwd: string): string {
  const path = rawPath.trim();
  if (path.startsWith('/') || path.startsWith('~/') || path === '~') return normalizePosixPath(path);
  const base = cwd.trim();
  return normalizePosixPath(base ? `${base.replace(/\/$/, '')}/${path}` : path);
}

export function safeUploadName(original: string): string {
  let name = original.split(/[\\/]/).pop() || 'attachment';
  name = [...name].map((character) => /[\x00-\x1f\x7f`\\/]/.test(character) ? '_' : character).join('').trim();
  while (name.includes('..')) name = name.replace(/\.\./g, '_');
  if (!name || name === '.' || name === '..') name = 'attachment';
  return name.slice(0, 140);
}

export function attachmentPrompt(prompt: string, paths: string[]): string {
  const heading = paths.length === 1 ? 'Attached file:' : 'Attached files:';
  return [prompt.trim(), `${heading}\n${paths.map((path) => `- ${path}`).join('\n')}`].filter(Boolean).join('\n\n');
}

export function isPreviewableImage(name: string): boolean {
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
  return PREVIEWABLE_IMAGE_EXTENSIONS.has(extension);
}

export function childPath(directory: string, name: string): string {
  return `${directory.replace(/\/$/, '')}/${name}`;
}
