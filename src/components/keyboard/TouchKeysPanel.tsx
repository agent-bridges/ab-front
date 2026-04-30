import { useKeyboardStore } from '../../stores/keyboardStore';

/**
 * Touch-keys settings — visibility, opacity, icon-size, and per-button enable
 * for the floating keyboard + scroll bar. Imported by both the desktop
 * SettingsModal (Visual tab) and the mobile MobileVisualPanel so behaviour
 * and layout stay identical.
 */
export default function TouchKeysPanel() {
  const k = useKeyboardStore((s) => s.keyboard);
  const scroll = useKeyboardStore((s) => s.scroll);
  const setKeyboardVisible = useKeyboardStore((s) => s.setKeyboardVisible);
  const setKeyboardOpacity = useKeyboardStore((s) => s.setKeyboardOpacity);
  const setKeyboardIconSize = useKeyboardStore((s) => s.setKeyboardIconSize);
  const toggleKeyboardButton = useKeyboardStore((s) => s.toggleKeyboardButton);
  const setScrollVisible = useKeyboardStore((s) => s.setScrollVisible);
  const setScrollOpacity = useKeyboardStore((s) => s.setScrollOpacity);
  const setScrollIconSize = useKeyboardStore((s) => s.setScrollIconSize);

  const buttonChips: { key: keyof typeof k.buttons; label: string }[] = [
    { key: 'arrowKeys', label: '← ↑ ↓ →' },
    { key: 'tab', label: 'Tab' },
    { key: 'enter', label: 'Enter' },
    { key: 'esc', label: 'Esc' },
    { key: 'ctrl', label: 'Ctrl' },
    { key: 'alt', label: 'Alt' },
    { key: 'shift', label: 'Shift' },
    { key: 'del', label: 'Del' },
  ];

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div className="text-xs font-semibold text-canvas-text">Floating keyboard</div>
        <label className="flex items-center gap-2 text-xs text-canvas-text">
          <input type="checkbox" checked={k.visible} onChange={(e) => setKeyboardVisible(e.target.checked)} className="accent-canvas-accent" />
          Show on screen
        </label>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-canvas-muted w-16">Opacity</span>
            <input type="range" min={20} max={100} value={k.opacity} onChange={(e) => setKeyboardOpacity(Number(e.target.value))} className="flex-1" />
            <span className="w-10 text-right text-[11px] text-canvas-text">{k.opacity}%</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-canvas-muted w-16">Size</span>
            <input type="range" min={12} max={36} value={k.iconSize} onChange={(e) => setKeyboardIconSize(Number(e.target.value))} className="flex-1" />
            <span className="w-10 text-right text-[11px] text-canvas-text">{k.iconSize}px</span>
          </div>
        </div>
        <div>
          <div className="text-[11px] text-canvas-muted mb-1.5">Buttons</div>
          <div className="flex flex-wrap gap-1.5">
            {buttonChips.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => toggleKeyboardButton(key)}
                className={`px-2 py-1 text-xs rounded border ${
                  k.buttons[key]
                    ? 'bg-canvas-accent/20 border-canvas-accent text-canvas-accent'
                    : 'bg-canvas-bg border-canvas-border text-canvas-muted hover:text-canvas-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-3 pt-3 border-t border-canvas-border">
        <div className="text-xs font-semibold text-canvas-text">Floating scroll bar</div>
        <label className="flex items-center gap-2 text-xs text-canvas-text">
          <input type="checkbox" checked={scroll.visible} onChange={(e) => setScrollVisible(e.target.checked)} className="accent-canvas-accent" />
          Show on screen
        </label>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-canvas-muted w-16">Opacity</span>
          <input type="range" min={20} max={100} value={scroll.opacity} onChange={(e) => setScrollOpacity(Number(e.target.value))} className="flex-1" />
          <span className="w-10 text-right text-[11px] text-canvas-text">{scroll.opacity}%</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-canvas-muted w-16">Size</span>
          <input type="range" min={12} max={36} value={scroll.iconSize} onChange={(e) => setScrollIconSize(Number(e.target.value))} className="flex-1" />
          <span className="w-10 text-right text-[11px] text-canvas-text">{scroll.iconSize}px</span>
        </div>
      </section>

      <div className="text-[10px] leading-relaxed text-canvas-muted bg-canvas-bg border border-canvas-border rounded p-2">
        Виджеты отправляют клавиши в <span className="text-canvas-text">последний нажатый терминал</span>. Перетаскивание — за ручку сбоку. Модификаторы (Ctrl / Alt / Shift) залипают по нажатию и снимаются после следующей клавиши.
      </div>
    </div>
  );
}
