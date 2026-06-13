import {
  NEEDS_RELOAD, type TierSetting,
  resolveGraphics, useGraphicsSettings, setGraphicsSetting, resetGraphicsSettings, graphicsNeedsReload,
} from '../graphicsSettings';
import { useDraggablePanel } from './useDraggablePanel';

/**
 * Video settings panel — every render knob that used to silently follow the
 * auto-detected device tier is now the player's to set. Each control is
 * tri-state: `Auto` follows the detected tier's preset, an explicit choice
 * overrides it. `Auto` everywhere = the exact previous behaviour, so the panel
 * never changes anything until the player touches it.
 *
 * Reload-gated knobs (quality preset / resolution / shadows are read once at
 * canvas creation) show a ⟳ and surface a reload banner once changed; the rest
 * apply live.
 */
type Opt<T> = { value: T; label: string };
const TRI_BOOL: Opt<'auto' | boolean>[] = [
  { value: 'auto', label: 'Auto' }, { value: true, label: 'On' }, { value: false, label: 'Off' },
];
const TIER_OPTS: Opt<TierSetting>[] = [
  { value: 'auto', label: 'Auto' }, { value: 'low', label: 'Low' }, { value: 'medium', label: 'Med' }, { value: 'high', label: 'High' },
];
const RES_OPTS: Opt<'auto' | number>[] = [
  { value: 'auto', label: 'Auto' }, { value: 1, label: '1×' }, { value: 1.5, label: '1.5×' }, { value: 2, label: '2×' },
];

function Segmented<T extends string | number | boolean>({ label, hint, options, value, onChange, reload }: {
  label: string; hint: string; options: Opt<T>[]; value: T; onChange: (v: T) => void; reload?: boolean;
}) {
  return (
    <div className="gfx-row">
      <div className="gfx-row__head">
        <span className="gfx-row__label">
          {label}{reload ? <span className="gfx-row__reload" title="Takes effect after reload">⟳</span> : null}
        </span>
        <span className="gfx-row__hint">{hint}</span>
      </div>
      <div className="gfx-seg" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            className={`gfx-seg__btn${o.value === value ? ' gfx-seg__btn--active' : ''}`}
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
          >{o.label}</button>
        ))}
      </div>
    </div>
  );
}

const onOff = (b: boolean): string => (b ? 'on' : 'off');

export function GraphicsPanel() {
  const ref = useDraggablePanel<HTMLElement>('graphics');
  const s = useGraphicsSettings();
  const r = resolveGraphics(s);
  const reload = graphicsNeedsReload();
  return (
    <section ref={ref} className="hud gfx-panel" aria-label="Video settings">
      <div className="panel-title">
        <strong>Video</strong>
        <span>graphics</span>
      </div>
      {reload ? (
        <button type="button" className="gfx-reload-banner" onClick={() => window.location.reload()}>
          ⟳ Reload to apply quality / resolution / shadows
        </button>
      ) : null}
      <Segmented label="Quality" hint={`now: ${r.tier}`} options={TIER_OPTS} value={s.tier} onChange={(v) => setGraphicsSetting('tier', v)} reload={NEEDS_RELOAD.has('tier')} />
      <Segmented label="Resolution" hint={`DPR cap ${r.resolutionScale}×`} options={RES_OPTS} value={s.resolutionScale} onChange={(v) => setGraphicsSetting('resolutionScale', v)} reload={NEEDS_RELOAD.has('resolutionScale')} />
      <Segmented label="Shadows" hint={`now: ${onOff(r.shadows)}`} options={TRI_BOOL} value={s.shadows} onChange={(v) => setGraphicsSetting('shadows', v)} reload={NEEDS_RELOAD.has('shadows')} />
      <Segmented label="Bloom" hint={`now: ${onOff(r.bloom)}`} options={TRI_BOOL} value={s.bloom} onChange={(v) => setGraphicsSetting('bloom', v)} />
      <Segmented label="God rays" hint={`now: ${onOff(r.godRays)}`} options={TRI_BOOL} value={s.godRays} onChange={(v) => setGraphicsSetting('godRays', v)} />
      <Segmented label="Anti-aliasing" hint={`now: ${onOff(r.antialias)}`} options={TRI_BOOL} value={s.antialias} onChange={(v) => setGraphicsSetting('antialias', v)} />
      <Segmented label="Vale HD water" hint={`now: ${onOff(r.valeHD)}`} options={TRI_BOOL} value={s.valeHD} onChange={(v) => setGraphicsSetting('valeHD', v)} />
      <Segmented label="Fog" hint={`now: ${onOff(r.fog)}`} options={TRI_BOOL} value={s.fog} onChange={(v) => setGraphicsSetting('fog', v)} />
      <button type="button" className="ghost-button gfx-reset" onClick={resetGraphicsSettings}>Reset to Auto</button>
    </section>
  );
}
