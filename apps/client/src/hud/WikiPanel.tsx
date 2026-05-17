import { useMemo, useState } from 'react';
import { CLASS_PASSIVES } from '../../../../packages/content/classPassives';
import { CLASS_SKILL_TREES, type CharacterClass } from '../../../../packages/content/classes';
import { EFFECT_SPECS, type EffectSpec } from '../../../../packages/content/effects';
import { ITEMS, type Item } from '../../../../packages/content/items';
import { RACE_PROFILES, type CharacterRace } from '../../../../packages/content/races';
import { SKILLS, type SkillDef } from '../../../../packages/content/skills';
import { capitalize } from './textUtils';
import { useDraggablePanel } from './useDraggablePanel';

type WikiTab = 'skills' | 'items' | 'classes' | 'races' | 'effects';

const TABS: ReadonlyArray<{ id: WikiTab; label: string }> = [
  { id: 'skills', label: 'Skills' },
  { id: 'items', label: 'Items' },
  { id: 'classes', label: 'Classes' },
  { id: 'races', label: 'Races' },
  { id: 'effects', label: 'Effects' },
];

export function WikiPanel() {
  const panelRef = useDraggablePanel<HTMLElement>('wiki');
  const [tab, setTab] = useState<WikiTab>('skills');
  const [query, setQuery] = useState('');

  return (
    <section ref={panelRef} className="wiki-panel" aria-label="Content reference">
      <div className="panel-title">
        <strong>Content Reference</strong>
        <span>auto-generated from specs</span>
      </div>
      <div className="wiki-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`wiki-tab${tab === t.id ? ' wiki-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
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
        {tab === 'skills' && <SkillsTab query={query} />}
        {tab === 'items' && <ItemsTab query={query} />}
        {tab === 'classes' && <ClassesTab query={query} />}
        {tab === 'races' && <RacesTab query={query} />}
        {tab === 'effects' && <EffectsTab query={query} />}
      </div>
    </section>
  );
}

function filterMatch(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function SkillsTab({ query }: { query: string }) {
  const rows = useMemo(() => Object.values(SKILLS).filter((s) =>
    filterMatch(`${s.name} ${s.description} ${s.kind ?? ''}`, query),
  ), [query]);
  return (
    <ul className="wiki-list">
      {rows.map((skill) => <SkillRow key={skill.id} skill={skill} />)}
    </ul>
  );
}

function SkillRow({ skill }: { skill: SkillDef }) {
  return (
    <li className="wiki-row">
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
          Applies: {skill.effects.map((e) => `${EFFECT_SPECS[e.type]?.label ?? e.type}(${e.value})`).join(', ')}
        </small>
      )}
    </li>
  );
}

function ItemsTab({ query }: { query: string }) {
  const rows = useMemo(() => Object.values(ITEMS).filter((i) =>
    filterMatch(`${i.name} ${i.description} ${i.type ?? ''} ${i.kind ?? ''}`, query),
  ), [query]);
  return (
    <ul className="wiki-list">
      {rows.map((item) => <ItemRow key={item.id} item={item} />)}
    </ul>
  );
}

function ItemRow({ item }: { item: Item }) {
  const stats = item.stats ?? {};
  return (
    <li className="wiki-row">
      <header>
        <strong>{item.name}</strong>
        <span className="wiki-row-tag">{item.kind ?? item.type}</span>
      </header>
      <p>{item.description}</p>
      <dl>
        {stats.pAtk !== undefined && <Pair k="P.Atk" v={`+${stats.pAtk}`} />}
        {stats.mAtk !== undefined && <Pair k="M.Atk" v={`+${stats.mAtk}`} />}
        {stats.pDef !== undefined && <Pair k="P.Def" v={`+${stats.pDef}`} />}
        {stats.mDef !== undefined && <Pair k="M.Def" v={`+${stats.mDef}`} />}
        {stats.hp !== undefined && <Pair k="HP" v={`+${stats.hp}`} />}
        {stats.mp !== undefined && <Pair k="MP" v={`+${stats.mp}`} />}
        {item.equip && <Pair k="Slot" v={(item.equip.allowedSlots ?? []).join(', ')} />}
        {item.weight && <Pair k="Weight" v={`${(item.weight / 1000).toFixed(1)} kg`} />}
        {item.healAmount && <Pair k="Heals" v={`${item.healAmount} HP`} />}
        {item.manaAmount && <Pair k="Restores" v={`${item.manaAmount} MP`} />}
      </dl>
    </li>
  );
}

function ClassesTab({ query }: { query: string }) {
  const rows = useMemo(() => (Object.keys(CLASS_SKILL_TREES) as CharacterClass[]).filter((c) => {
    const tree = CLASS_SKILL_TREES[c];
    return filterMatch(`${c} ${tree?.description ?? ''}`, query);
  }), [query]);
  return (
    <ul className="wiki-list">
      {rows.map((cls) => <ClassRow key={cls} cls={cls} />)}
    </ul>
  );
}

function ClassRow({ cls }: { cls: CharacterClass }) {
  const tree = CLASS_SKILL_TREES[cls];
  const passive = CLASS_PASSIVES[cls];
  return (
    <li className="wiki-row">
      <header>
        <strong>{capitalize(cls)}</strong>
        <span className="wiki-row-tag">{Object.keys(tree?.skillProgression ?? {}).length} skills</span>
      </header>
      <p>{tree?.description ?? ''}</p>
      {passive && (
        <small className="wiki-row-footer">
          Passive: <strong>{passive.name}</strong> — {passive.description}
        </small>
      )}
      <small className="wiki-row-footer">
        Tree: {Object.keys(tree?.skillProgression ?? {}).join(', ')}
      </small>
    </li>
  );
}

function RacesTab({ query }: { query: string }) {
  const rows = useMemo(() => (Object.keys(RACE_PROFILES) as CharacterRace[]).filter((r) => {
    const p = RACE_PROFILES[r];
    return filterMatch(`${r} ${p.name} ${p.description}`, query);
  }), [query]);
  return (
    <ul className="wiki-list">
      {rows.map((race) => <RaceRow key={race} race={race} />)}
    </ul>
  );
}

function RaceRow({ race }: { race: CharacterRace }) {
  const profile = RACE_PROFILES[race];
  const attrs = profile.baseAttrs;
  return (
    <li className="wiki-row">
      <header>
        <strong>{profile.name}</strong>
        <span className="wiki-row-tag">{race}</span>
      </header>
      <p>{profile.description}</p>
      {attrs && (
        <dl>
          <Pair k="STR" v={String(attrs.str)} />
          <Pair k="DEX" v={String(attrs.dex)} />
          <Pair k="CON" v={String(attrs.con)} />
          <Pair k="INT" v={String(attrs.int)} />
          <Pair k="WIT" v={String(attrs.wit)} />
          <Pair k="MEN" v={String(attrs.men)} />
        </dl>
      )}
    </li>
  );
}

function EffectsTab({ query }: { query: string }) {
  const rows = useMemo(() => (Object.values(EFFECT_SPECS) as EffectSpec[]).filter((e) =>
    filterMatch(`${e.label} ${e.description} ${e.category}`, query),
  ), [query]);
  return (
    <ul className="wiki-list">
      {rows.map((effect) => (
        <li key={effect.type} className="wiki-row">
          <header>
            <strong>{effect.label}</strong>
            <span className="wiki-row-tag">{effect.category}</span>
          </header>
          <p>{effect.description}</p>
          <small className="wiki-row-footer">
            Type id: <code>{effect.type}</code>
            {effect.valueUnit ? ` · value unit: ${effect.valueUnit}` : ''}
          </small>
        </li>
      ))}
    </ul>
  );
}

function Pair({ k, v }: { k: string; v: string }) {
  return (
    <div className="wiki-pair">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
