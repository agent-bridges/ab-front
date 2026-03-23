const WORLD_ORIGIN = 4000;
const TOOLBAR_H = 40;
const STAGGER = 96;

interface SpawnPositionOptions {
  panX: number;
  panY: number;
  zoom: number;
  index?: number;
  itemSize?: number;
  isMobile?: boolean;
  canvasRoot?: HTMLElement | null;
}

export function getViewportSpawnPosition({
  panX,
  panY,
  zoom,
  index = 0,
  itemSize = 80,
  isMobile = false,
  canvasRoot,
}: SpawnPositionOptions) {
  const viewportW = canvasRoot?.clientWidth ?? window.innerWidth;
  const viewportH = canvasRoot?.clientHeight ?? (isMobile ? window.innerHeight - TOOLBAR_H : window.innerHeight - TOOLBAR_H);
  const worldLeft = isMobile ? -panX / zoom : panX / zoom - WORLD_ORIGIN;
  const worldTop = isMobile ? -panY / zoom : panY / zoom - WORLD_ORIGIN;
  const worldW = viewportW / zoom;
  const worldH = viewportH / zoom;
  const offset = (index % 4) * STAGGER;

  return {
    x: worldLeft + worldW / 2 - itemSize / 2 + offset,
    y: worldTop + worldH / 2 - itemSize / 2 + offset / 2,
  };
}
