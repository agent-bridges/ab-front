import type { CanvasItem } from '../types';

const AUTO_LABEL_PREFIX = '__auto__:';

function getPathLeaf(path: string): string {
  if (!path || path === '/') return '/';
  if (path === '~') return '~';

  const normalized = path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
  const leaf = normalized.split('/').filter(Boolean).pop();
  return leaf || normalized;
}

export function getPathLeafForTitle(path: string): string {
  return getPathLeaf(path);
}

function shortStableId(raw: string): string {
  const compact = raw.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return (compact || 'item').slice(-6);
}

function parseAutoLabel(label: string): { type: string; base: string } | null {
  if (!label.startsWith(AUTO_LABEL_PREFIX)) return null;
  const rest = label.slice(AUTO_LABEL_PREFIX.length);
  const idx = rest.indexOf(':');
  if (idx === -1) return null;
  return {
    type: rest.slice(0, idx),
    base: rest.slice(idx + 1),
  };
}

export function makeAutoLabel(type: CanvasItem['type'], base: string): string {
  return `${AUTO_LABEL_PREFIX}${type}:${base}`;
}

export function isAutoLabel(label: string): boolean {
  return label.startsWith(AUTO_LABEL_PREFIX);
}

export function getCanvasItemTitle(item: CanvasItem, options?: { fullPath?: boolean }): string {
  const auto = parseAutoLabel(item.label);
  const suffix = `-#${shortStableId(item.ptyId || item.id)}`;

  if (auto) {
    if (item.type === 'anchor') {
      return auto.base;
    }

    if (item.type === 'filebrowser') {
      const pathBase = item.currentPath
        ? (options?.fullPath ? item.currentPath : getPathLeaf(item.currentPath))
        : auto.base;
      return `${pathBase}${suffix}`;
    }

    if (item.type === 'terminal') {
      const pathBase = item.currentPath
        ? (options?.fullPath ? item.currentPath : getPathLeaf(item.currentPath))
        : auto.base;
      return `${pathBase}${suffix}`;
    }

    return `${auto.base}${suffix}`;
  }

  return item.label;
}
