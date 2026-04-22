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
      // If the user explicitly set a session label (e.g. "s1" via
      // `ab sessions meta --label s1`), syncTerminals stored it as auto.base
      // via getTerminalAutoBase which checks session.label first. In that
      // case use auto.base as-is. Otherwise derive from the current cwd so
      // the title follows `cd`.
      //
      // We can't reliably tell from auto.base alone whether it was a user
      // label or a path leaf, so the rule is: if item.currentPath exists AND
      // its leaf matches auto.base, prefer the path (keeps it live). If they
      // differ, auto.base was an explicit label — use it.
      if (item.currentPath) {
        const leaf = options?.fullPath ? item.currentPath : getPathLeaf(item.currentPath);
        if (auto.base === getPathLeaf(item.currentPath)) {
          // auto-derived from cwd → keep live behaviour
          return `${leaf}${suffix}`;
        }
        // user-set label differs from cwd leaf → respect user label, no suffix
        return auto.base;
      }
      return `${auto.base}${suffix}`;
    }

    return `${auto.base}${suffix}`;
  }

  return item.label;
}
