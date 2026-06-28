import { useMemo } from 'react';
import { SOUND_GROUPS, type SoundPreview } from '../audio/soundCatalog';
import { playSample } from '../audio/samples';
import { playWindup } from '../audio/spellVoices';
import { playCue } from '../sfx';
import { FocusableLi, filterMatch } from './WikiPanel';

/**
 * The Sounds tab — a browsable library of every sound the game plays, named and
 * grouped by phase (cast → travel → impact → events → cues). Each row's chips
 * play the actual sound in game so you can match a name to what you hear. Data
 * is derived from the engine's own sound maps (see audio/soundCatalog).
 */

function preview(p: SoundPreview): void {
  if (p.kind === 'sample') playSample(p.urls, p.gain);
  else if (p.kind === 'windup') playWindup(p.params);
  else playCue(p.cue);
}

export function SoundsTab({
  query, focusId, focusKey,
}: { query: string; focusId: string | null; focusKey: string }) {
  const groups = useMemo(
    () =>
      SOUND_GROUPS.map((group) => ({
        ...group,
        entries: group.entries.filter((entry) =>
          filterMatch(`${entry.title} ${entry.detail} ${entry.variants.map((v) => v.name).join(' ')}`, query),
        ),
      })).filter((group) => group.entries.length > 0),
    [query],
  );

  return (
    <div className="wiki-sounds">
      {groups.map((group) => (
        <section key={group.id} className="wiki-sound-group">
          <div className="wiki-sound-group-head">
            <strong>{group.title}</strong>
            <span>{group.blurb}</span>
          </div>
          <ul className="wiki-list">
            {group.entries.map((entry) => (
              <FocusableLi key={entry.id} isFocus={entry.id === focusId} focusKey={focusKey}>
                <header>
                  <strong>{entry.title}</strong>
                  <span className="wiki-row-tag">{entry.synth ? 'synth' : 'sample'}</span>
                </header>
                <p>{entry.detail}</p>
                <div className="wiki-sound-variants">
                  {entry.variants.map((variant) => (
                    <button
                      key={variant.name}
                      type="button"
                      className="wiki-effect-chip wiki-sound-play"
                      onClick={() => preview(variant.preview)}
                      title="Play this sound"
                    >
                      ▶ {variant.name}
                    </button>
                  ))}
                </div>
              </FocusableLi>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
