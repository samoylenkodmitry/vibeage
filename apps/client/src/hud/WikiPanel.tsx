import { useEffect, useMemo, useRef, useState } from 'react';
import { CLASS_PASSIVES } from '../../../../packages/content/classPassives';
import { CLASS_SKILL_TREES, type CharacterClass } from '../../../../packages/content/classes';
import { EFFECT_SPECS, type EffectSpec } from '../../../../packages/content/effects';
import { listMobTemplates, getMobZones } from '../../../../packages/content/mobLocations';
import { getMiniBossesByMobType } from '../../../../packages/content/miniBosses';
import { BossesTab } from './WikiBosses';
import { ItemsTab } from './WikiItems';
import { LootDropsForTable } from './WikiLoot';
import { QuestsTab } from './WikiQuests';
import { RecipesTab } from './WikiRecipes';
import { SetsTab } from './WikiSets';
import { RACE_PROFILES, type CharacterRace } from '../../../../packages/content/races';
import { SKILLS, type SkillDef } from '../../../../packages/content/skills';
import {
  SPECIALIZATIONS,
  type Specialization,
} from '../../../../packages/content/specializations';
import { STATS, type StatDef } from '../../../../packages/content/stats';
import { capitalize } from './textUtils';
import { useDraggablePanel } from './useDraggablePanel';
import { subscribeWikiNav } from './wikiNavBus';
type WikiTab =
  | 'skills' | 'items' | 'tree' | 'classes' | 'specs' | 'races'
  | 'effects' | 'quests' | 'stats' | 'mobs' | 'bosses' | 'recipes' | 'sets';

const TABS: ReadonlyArray<{ id: WikiTab; label: string }> = [
  { id: 'skills', label: 'Skills' },
  { id: 'items', label: 'Items' },
  { id: 'tree', label: 'Tree' },
  { id: 'classes', label: 'Classes' },
  { id: 'specs', label: 'Specs' },
  { id: 'races', label: 'Races' },
  { id: 'effects', label: 'Effects' },
  { id: 'quests', label: 'Quests' },
  { id: 'stats', label: 'Stats' },
  { id: 'mobs', label: 'Mobs' },
  { id: 'bosses', label: 'Bosses' },
  { id: 'recipes', label: 'Recipes' },
  { id: 'sets', label: 'Sets' },
];

type WikiNav = (tab: WikiTab, id: string) => void;

type WikiPanelProps = {
  onShowMarker?: (pos: { x: number; z: number } | null) => void;
};

type WikiHistoryEntry = { tab: WikiTab; focusId: string | null };

export function WikiPanel({ onShowMarker }: WikiPanelProps) {
  const panelRef = useDraggablePanel<HTMLElement>('wiki');
  // Single stack instead of (tab, focus) refs: every navigation
  // pushes here; Back pops to the previous entry. The cursor index
  // points into history so Back / Forward both work like a browser.
  const [history, setHistory] = useState<WikiHistoryEntry[]>([{ tab: 'skills', focusId: null }]);
  const [cursor, setCursor] = useState(0);
  const [focusNonce, setFocusNonce] = useState(0);
  const [query, setQuery] = useState('');
  const current = history[cursor];
  const tab = current.tab;
  const focusId = current.focusId;
  const focusKey = focusId ? `${focusId}:${focusNonce}` : '';

  const navigate: WikiNav = (toTab, id) => {
    setHistory((prev) => {
      // Truncate forward history when a new branch starts (browser-
      // style). The new entry replaces what was after the cursor.
      const next = prev.slice(0, cursor + 1);
      next.push({ tab: toTab, focusId: id });
      return next;
    });
    setCursor((c) => c + 1);
    setFocusNonce((n) => n + 1);
  };

  // External navigation: subscribe to the wikiNavBus so panels
  // outside the Wiki (PlayerPanel, SkillBar) can request a jump to
  // a specific tab + focus row without threading a callback chain.
  useEffect(() => {
    return subscribeWikiNav(({ tab: t, id }) => navigate(t, id));
  }, [cursor]);
  const setTabFromTabBar = (t: WikiTab) => navigate(t, '');
  const canBack = cursor > 0;
  const canForward = cursor < history.length - 1;
  const goBack = () => {
    if (!canBack) return;
    setCursor(cursor - 1);
    setFocusNonce((n) => n + 1);
  };
  const goForward = () => {
    if (!canForward) return;
    setCursor(cursor + 1);
    setFocusNonce((n) => n + 1);
  };

  return (
    <section ref={panelRef} className="wiki-panel" aria-label="Content reference">
      <div className="panel-title">
        <strong>Content Reference</strong>
        <span>auto-generated from specs</span>
      </div>
      <div className="wiki-nav">
        <button type="button" className="wiki-nav-button" disabled={!canBack} onClick={goBack} title="Back">←</button>
        <button type="button" className="wiki-nav-button" disabled={!canForward} onClick={goForward} title="Forward">→</button>
      </div>
      <div className="wiki-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`wiki-tab${tab === t.id ? ' wiki-tab--active' : ''}`}
            onClick={() => setTabFromTabBar(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <input
        className="wiki-search"
        placeholder="Filter…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Filter content reference"
      />
      <div className="wiki-body">
        {tab === 'skills' && <SkillsTab query={query} focusId={focusId} focusKey={focusKey} navigate={navigate} />}
        {tab === 'items' && <ItemsTab query={query} focusId={focusId} focusKey={focusKey} navigate={navigate} />}
        {tab === 'tree' && <TreeTab query={query} navigate={navigate} />}
        {tab === 'classes' && <ClassesTab query={query} focusId={focusId} focusKey={focusKey} navigate={navigate} />}
        {tab === 'specs' && <SpecsTab query={query} focusId={focusId} focusKey={focusKey} navigate={navigate} />}
        {tab === 'races' && <RacesTab query={query} focusId={focusId} focusKey={focusKey} navigate={navigate} />}
        {tab === 'effects' && <EffectsTab query={query} focusId={focusId} focusKey={focusKey} />}
        {tab === 'quests' && <QuestsTab query={query} navigate={navigate} />}
        {tab === 'stats' && <StatsTab query={query} focusId={focusId} focusKey={focusKey} />}
        {tab === 'mobs' && <MobsTab query={query} focusId={focusId} focusKey={focusKey} onShowMarker={onShowMarker} navigate={navigate} />}
        {tab === 'bosses' && <BossesTab query={query} focusId={focusId} focusKey={focusKey} navigate={navigate} />}
        {tab === 'recipes' && <RecipesTab query={query} focusId={focusId} focusKey={focusKey} navigate={navigate} />}
        {tab === 'sets' && <SetsTab query={query} focusId={focusId} focusKey={focusKey} navigate={navigate} />}
      </div>
    </section>
  );
}

function filterMatch(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/** Scroll a focused row into view when nav lands on it. */
function useFocusScroll(focusKey: string, ref: React.RefObject<HTMLLIElement | null>) {
  useEffect(() => {
    if (focusKey && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusKey]);
}

function FocusableLi({
  isFocus, focusKey, children, className,
}: {
  isFocus: boolean;
  focusKey: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLLIElement | null>(null);
  useFocusScroll(isFocus ? focusKey : '', ref);
  return (
    <li ref={isFocus ? ref : undefined} className={`${className ?? 'wiki-row'}${isFocus ? ' wiki-row--focus' : ''}`}>
      {children}
    </li>
  );
}

// ---------- Skills ----------

function SkillsTab({ query, focusId, focusKey, navigate }: { query: string; focusId: string | null; focusKey: string; navigate: WikiNav }) {
  const rows = useMemo(() => Object.values(SKILLS).filter((s) =>
    filterMatch(`${s.name} ${s.description} ${s.kind ?? ''}`, query),
  ), [query]);
  return (
    <ul className="wiki-list">
      {rows.map((skill) => (
        <SkillRow key={skill.id} skill={skill} isFocus={skill.id === focusId} focusKey={focusKey} navigate={navigate} />
      ))}
    </ul>
  );
}

function SkillRow({ skill, isFocus, focusKey, navigate }: { skill: SkillDef; isFocus: boolean; focusKey: string; navigate: WikiNav }) {
  return (
    <FocusableLi isFocus={isFocus} focusKey={focusKey}>
      <header>
        <strong>{skill.name}</strong>
        <span className="wiki-row-tag">{skill.kind ?? 'magical'}</span>
      </header>
      <p>{skill.description}</p>
      <dl>
        {skill.dmg !== undefined && <Pair k="Damage" v={String(skill.dmg)} />}
        {skill.range !== undefined && <Pair k="Range" v={String(skill.range)} />}
        {skill.area !== undefined && <Pair k="Area" v={String(skill.area)} />}
        <Pair k="Mana" v={skill.manaCost > 0 ? String(skill.manaCost) : 'free'} />
        <Pair k="Cast" v={skill.castMs > 0 ? `${(skill.castMs / 1000).toFixed(2)}s` : 'instant'} />
        <Pair k="CD" v={skill.cooldownMs > 0 ? `${(skill.cooldownMs / 1000).toFixed(1)}s` : '-'} />
        <Pair k="Lv" v={String(skill.levelRequired)} />
        {skill.autoRepeat && <Pair k="Auto-repeat" v="yes" />}
        {skill.requiresTarget && <Pair k="Target" v="required" />}
      </dl>
      {skill.effects.length > 0 && (
        <small className="wiki-row-footer">
          Applies:{' '}
          {skill.effects.map((e, i) => {
            const spec = EFFECT_SPECS[e.type];
            const unit = spec?.valueUnit ? ` ${spec.valueUnit}` : '';
            const duration = e.durationMs ? ` for ${(e.durationMs / 1000).toFixed(1)}s` : '';
            return (
              <span key={e.type + i}>
                {i > 0 && ', '}
                <button
                  type="button"
                  className="wiki-effect-chip"
                  onClick={() => navigate('effects', e.type)}
                  title={spec?.description ?? 'Click for details'}
                >
                  {spec?.label ?? e.type}
                </button>
                {`(${e.value}${unit}${duration})`}
              </span>
            );
          })}
        </small>
      )}
      {skill.upgrades?.length ? (
        <small className="wiki-row-footer">
          Upgrades: {skill.upgrades.map((u) => `Lv${u.level}: ${u.description}`).join(' · ')}
        </small>
      ) : null}
    </FocusableLi>
  );
}

// ---------- Tree ----------

function TreeTab({ query, navigate }: { query: string; navigate: WikiNav }) {
  const races = Object.keys(RACE_PROFILES) as CharacterRace[];
  return (
    <ul className="wiki-tree">
      {races.map((race) => <RaceTreeRow key={race} race={race} query={query} navigate={navigate} />)}
    </ul>
  );
}

function RaceTreeRow({ race, query, navigate }: { race: CharacterRace; query: string; navigate: WikiNav }) {
  const profile = RACE_PROFILES[race];
  const visible = profile.allowedClasses.filter((cls) =>
    filterMatch(`${race} ${profile.name} ${cls} ${CLASS_SKILL_TREES[cls]?.description ?? ''}`, query),
  );
  if (visible.length === 0) return null;
  return (
    <li className="wiki-tree-node wiki-tree-node--root">
      <button type="button" className="wiki-tree-link" onClick={() => navigate('races', race)}>
        <strong>{profile.name}</strong>
      </button>
      <ul className="wiki-tree-children">
        {visible.map((cls) => <ClassTreeRow key={cls} cls={cls} navigate={navigate} />)}
      </ul>
    </li>
  );
}

function ClassTreeRow({ cls, navigate }: { cls: CharacterClass; navigate: WikiNav }) {
  const passive = CLASS_PASSIVES[cls];
  const specs = Object.values(SPECIALIZATIONS).filter((s) => s.baseClass === cls);
  return (
    <li className="wiki-tree-node">
      <button type="button" className="wiki-tree-link" onClick={() => navigate('classes', cls)}>
        {capitalize(cls)}
      </button>
      <ul className="wiki-tree-children">
        {passive && (
          <li className="wiki-tree-node wiki-tree-node--leaf">
            <span className="wiki-tree-label" title={passive.description}>Passive: {passive.name}</span>
          </li>
        )}
        {specs.map((spec) => (
          <li key={spec.id} className="wiki-tree-node">
            <button type="button" className="wiki-tree-link" onClick={() => navigate('specs', spec.id)}>
              Spec: {spec.name}
            </button>
          </li>
        ))}
      </ul>
    </li>
  );
}

// ---------- Classes ----------

function ClassesTab({ query, focusId, focusKey, navigate }: { query: string; focusId: string | null; focusKey: string; navigate: WikiNav }) {
  const rows = useMemo(() => (Object.keys(CLASS_SKILL_TREES) as CharacterClass[]).filter((c) => {
    const tree = CLASS_SKILL_TREES[c];
    return filterMatch(`${c} ${tree?.description ?? ''}`, query);
  }), [query]);
  return (
    <ul className="wiki-list">
      {rows.map((cls) => (
        <ClassRow key={cls} cls={cls} isFocus={cls === focusId} focusKey={focusKey} navigate={navigate} />
      ))}
    </ul>
  );
}

function ClassRow({ cls, isFocus, focusKey, navigate }: { cls: CharacterClass; isFocus: boolean; focusKey: string; navigate: WikiNav }) {
  const tree = CLASS_SKILL_TREES[cls];
  const passive = CLASS_PASSIVES[cls];
  const skillIds = Object.keys(tree?.skillProgression ?? {}) as Array<keyof typeof SKILLS>;
  const races = (Object.keys(RACE_PROFILES) as CharacterRace[]).filter((r) =>
    RACE_PROFILES[r].allowedClasses.includes(cls),
  );
  return (
    <FocusableLi isFocus={isFocus} focusKey={focusKey}>
      <header>
        <strong>{capitalize(cls)}</strong>
        <span className="wiki-row-tag">{skillIds.length} skills</span>
      </header>
      <p>{tree?.description ?? ''}</p>
      {passive && (
        <small className="wiki-row-footer">
          Passive: <strong>{passive.name}</strong> — {passive.description}
        </small>
      )}
      <small className="wiki-row-footer">
        Skills:{' '}
        {skillIds.map((id, i) => (
          <span key={id}>
            {i > 0 && ', '}
            <button type="button" className="wiki-effect-chip" onClick={() => navigate('skills', id)}>
              {SKILLS[id]?.name ?? id}
            </button>
          </span>
        ))}
      </small>
      <small className="wiki-row-footer">
        Races:{' '}
        {races.length
          ? races.map((r, i) => (
              <span key={r}>
                {i > 0 && ', '}
                <button type="button" className="wiki-effect-chip" onClick={() => navigate('races', r)}>
                  {RACE_PROFILES[r].name}
                </button>
              </span>
            ))
          : '—'}
      </small>
    </FocusableLi>
  );
}

// ---------- Specs ----------

function SpecsTab({ query, focusId, focusKey, navigate }: { query: string; focusId: string | null; focusKey: string; navigate: WikiNav }) {
  const rows = useMemo(() => Object.values(SPECIALIZATIONS).filter((s) =>
    filterMatch(
      `${s.name} ${s.baseClass} ${s.description} ${s.specializationPassive.name} ${s.proficiencyPassive.name}`,
      query,
    ),
  ), [query]);
  return (
    <ul className="wiki-list">
      {rows.map((spec) => (
        <SpecRow key={spec.id} spec={spec} isFocus={spec.id === focusId} focusKey={focusKey} navigate={navigate} />
      ))}
    </ul>
  );
}

function SpecRow({ spec, isFocus, focusKey, navigate }: { spec: Specialization; isFocus: boolean; focusKey: string; navigate: WikiNav }) {
  const specSkills = spec.specSkills ?? [];
  const profSkills = spec.proficiencySkills ?? [];
  return (
    <FocusableLi isFocus={isFocus} focusKey={focusKey}>
      <header>
        <strong>{spec.name}</strong>
        <button type="button" className="wiki-effect-chip" onClick={() => navigate('classes', spec.baseClass)}>
          {capitalize(spec.baseClass)}
        </button>
      </header>
      <p>{spec.description}</p>
      <dl>
        <Pair k="Unlock Lv" v={String(spec.unlockLevel)} />
        <Pair k="Proficient Lv" v={String(spec.proficiencyLevel)} />
      </dl>
      <small className="wiki-row-footer">
        Spec passive: <strong>{spec.specializationPassive.name}</strong> — {spec.specializationPassive.description}
      </small>
      <small className="wiki-row-footer">
        Proficient: <strong>{spec.proficiencyPassive.name}</strong> — {spec.proficiencyPassive.description}
      </small>
      {specSkills.length > 0 && (
        <small className="wiki-row-footer">
          Spec skills:{' '}
          {specSkills.map((id, i) => (
            <span key={id}>
              {i > 0 && ', '}
              <button type="button" className="wiki-effect-chip" onClick={() => navigate('skills', id)}>
                {SKILLS[id]?.name ?? id}
              </button>
            </span>
          ))}
        </small>
      )}
      {profSkills.length > 0 && (
        <small className="wiki-row-footer">
          Proficiency skills:{' '}
          {profSkills.map((id, i) => (
            <span key={id}>
              {i > 0 && ', '}
              <button type="button" className="wiki-effect-chip" onClick={() => navigate('skills', id)}>
                {SKILLS[id]?.name ?? id}
              </button>
            </span>
          ))}
        </small>
      )}
    </FocusableLi>
  );
}

// ---------- Races ----------

function RacesTab({ query, focusId, focusKey, navigate }: { query: string; focusId: string | null; focusKey: string; navigate: WikiNav }) {
  const rows = useMemo(() => (Object.keys(RACE_PROFILES) as CharacterRace[]).filter((r) => {
    const p = RACE_PROFILES[r];
    return filterMatch(`${r} ${p.name} ${p.description}`, query);
  }), [query]);
  return (
    <ul className="wiki-list">
      {rows.map((race) => (
        <RaceRow key={race} race={race} isFocus={race === focusId} focusKey={focusKey} navigate={navigate} />
      ))}
    </ul>
  );
}

function RaceRow({ race, isFocus, focusKey, navigate }: { race: CharacterRace; isFocus: boolean; focusKey: string; navigate: WikiNav }) {
  const profile = RACE_PROFILES[race];
  const attrs = profile.baseAttrs;
  return (
    <FocusableLi isFocus={isFocus} focusKey={focusKey}>
      <header>
        <strong>{profile.name}</strong>
        <span className="wiki-row-tag">{race}</span>
      </header>
      <p>{profile.description}</p>
      {attrs && (
        <dl>
          {Object.entries(attrs).map(([k, v]) => (
            <div key={k} className="wiki-pair">
              <dt>
                <button type="button" className="wiki-effect-chip" onClick={() => navigate('stats', k)}>
                  {k.toUpperCase()}
                </button>
              </dt>
              <dd>{String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      <small className="wiki-row-footer">
        Allowed classes:{' '}
        {profile.allowedClasses.map((cls, i) => (
          <span key={cls}>
            {i > 0 && ', '}
            <button type="button" className="wiki-effect-chip" onClick={() => navigate('classes', cls)}>
              {capitalize(cls)}
            </button>
          </span>
        ))}
      </small>
    </FocusableLi>
  );
}

// ---------- Effects ----------

function EffectsTab({ query, focusId, focusKey }: { query: string; focusId: string | null; focusKey: string }) {
  const rows = useMemo(() => (Object.values(EFFECT_SPECS) as EffectSpec[]).filter((e) =>
    filterMatch(`${e.label} ${e.description} ${e.category}`, query),
  ), [query]);
  return (
    <ul className="wiki-list">
      {rows.map((effect) => (
        <FocusableLi key={effect.type} isFocus={effect.type === focusId} focusKey={focusKey}>
          <header>
            <strong>{effect.label}</strong>
            <span className="wiki-row-tag">{effect.category}</span>
          </header>
          <p>{effect.description}</p>
          <small className="wiki-row-footer">
            Type id: <code>{effect.type}</code>
            {effect.valueUnit ? ` · value unit: ${effect.valueUnit}` : ''}
          </small>
        </FocusableLi>
      ))}
    </ul>
  );
}

// ---------- Quests ----------

// ---------- Stats ----------

function StatsTab({ query, focusId, focusKey }: { query: string; focusId: string | null; focusKey: string }) {
  const rows = useMemo(() => Object.values(STATS).filter((s) =>
    filterMatch(`${s.short} ${s.name} ${s.description}`, query),
  ), [query]);
  return (
    <ul className="wiki-list">
      {rows.map((stat) => <StatRow key={stat.id} stat={stat} isFocus={stat.id === focusId} focusKey={focusKey} />)}
    </ul>
  );
}

function StatRow({ stat, isFocus, focusKey }: { stat: StatDef; isFocus: boolean; focusKey: string }) {
  return (
    <FocusableLi isFocus={isFocus} focusKey={focusKey}>
      <header>
        <strong>{stat.short} — {stat.name}</strong>
        {stat.tags && stat.tags.length > 0 && <span className="wiki-row-tag">{stat.tags.join(', ')}</span>}
      </header>
      <p>{stat.description}</p>
    </FocusableLi>
  );
}

// ---------- Mobs ----------

function MobsTab({
  query, focusId, focusKey, onShowMarker, navigate,
}: {
  query: string;
  focusId: string | null;
  focusKey: string;
  onShowMarker?: (pos: { x: number; z: number } | null) => void;
  navigate: WikiNav;
}) {
  const rows = useMemo(() => listMobTemplates().filter((t) =>
    filterMatch(`${t.type} ${t.displayName} ${t.family}`, query),
  ), [query]);
  return (
    <ul className="wiki-list">
      {rows.map((tpl) => {
        const zones = getMobZones(tpl.type);
        const bosses = getMiniBossesByMobType(tpl.type);
        return (
          <FocusableLi key={tpl.type} isFocus={tpl.type === focusId} focusKey={focusKey}>
            <header>
              <strong>{tpl.displayName}</strong>
              <span className="wiki-row-tag">{tpl.family}</span>
            </header>
            <small className="wiki-row-footer">
              Type id: <code>{tpl.type}</code>
            </small>
            <MobStatsSummary tpl={tpl} zones={zones} />
            {zones.length === 0 && <small className="wiki-row-footer">No known spawn zone.</small>}
            {zones.length > 0 && (
              <small className="wiki-row-footer">
                Spawns in:{' '}
                {zones.map((z, i) => (
                  <span key={z.zone.id}>
                    {i > 0 && ', '}
                    <button
                      type="button"
                      className="wiki-effect-chip"
                      onClick={() => onShowMarker?.({ x: z.position.x, z: z.position.z })}
                      title={`${z.zone.name} (${Math.round(z.position.x)}, ${Math.round(z.position.z)})`}
                    >
                      {z.zone.name}
                    </button>
                  </span>
                ))}
              </small>
            )}
            {bosses.length > 0 && (
              <small className="wiki-row-footer">
                Boss variant:{' '}
                {bosses.map((b, i) => (
                  <span key={b.id}>
                    {i > 0 && ', '}
                    <button type="button" className="wiki-effect-chip" onClick={() => navigate('bosses', b.id)}>
                      {b.name}
                    </button>
                  </span>
                ))}
              </small>
            )}
            <LootDropsForTable tableId={`${tpl.type}_loot`} navigate={navigate} />
          </FocusableLi>
        );
      })}
    </ul>
  );
}

/**
 * PR W — derived HP / damage at the lowest level the mob spawns at,
 * computed from the same formula createEnemy uses (server-side):
 *   hp = (100 + level*20) * template.stats.health
 *   dmg = (10 + level*2)  * template.stats.damage
 * Same template + same constants, so the displayed numbers match
 * what actually spawns in the world.
 */
function MobStatsSummary({
  tpl, zones,
}: {
  tpl: ReturnType<typeof listMobTemplates>[number];
  zones: ReturnType<typeof getMobZones>;
}) {
  const lvl = zones.length > 0 ? Math.min(...zones.map((z) => z.zone.minLevel)) : 1;
  const hp = Math.round((100 + lvl * 20) * tpl.stats.health);
  const dmg = Math.round((10 + lvl * 2) * tpl.stats.damage);
  return (
    <small className="wiki-row-footer">
      Lv {lvl}: <strong>{hp}</strong> HP · <strong>{dmg}</strong> dmg ·
      {' '}aggro {Math.round(15 * tpl.stats.aggroRadius)}m
      {tpl.stats.movementSpeed !== 1 && <> · speed ×{tpl.stats.movementSpeed.toFixed(2)}</>}
      {tpl.stats.attackRange !== 1 && <> · reach ×{tpl.stats.attackRange.toFixed(2)}</>}
    </small>
  );
}

// ---------- Shared ----------

function Pair({ k, v }: { k: string; v: string }) {
  return (
    <div className="wiki-pair">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
