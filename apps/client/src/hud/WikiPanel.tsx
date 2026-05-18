import { useEffect, useMemo, useRef, useState } from 'react';
import { CLASS_PASSIVES } from '../../../../packages/content/classPassives';
import { CLASS_SKILL_TREES, type CharacterClass } from '../../../../packages/content/classes';
import { EFFECT_SPECS, type EffectSpec } from '../../../../packages/content/effects';
import { ITEMS, type Item } from '../../../../packages/content/items';
import { RACE_PROFILES, type CharacterRace } from '../../../../packages/content/races';
import { SKILLS, type SkillDef } from '../../../../packages/content/skills';
import {
  SPECIALIZATIONS,
  type Specialization,
} from '../../../../packages/content/specializations';
import { QUEST_NPCS } from '../../../../packages/content/npcs';
import { QUESTS, type QuestDef } from '../../../../packages/content/quests';
import { capitalize } from './textUtils';
import { useDraggablePanel } from './useDraggablePanel';

type WikiTab = 'skills' | 'items' | 'tree' | 'classes' | 'specs' | 'races' | 'effects' | 'quests';

const TABS: ReadonlyArray<{ id: WikiTab; label: string }> = [
  { id: 'skills', label: 'Skills' },
  { id: 'items', label: 'Items' },
  { id: 'tree', label: 'Tree' },
  { id: 'classes', label: 'Classes' },
  { id: 'specs', label: 'Specs' },
  { id: 'races', label: 'Races' },
  { id: 'effects', label: 'Effects' },
  { id: 'quests', label: 'Quests' },
];

export function WikiPanel() {
  const panelRef = useDraggablePanel<HTMLElement>('wiki');
  const [tab, setTab] = useState<WikiTab>('skills');
  const [query, setQuery] = useState('');
  // When a SkillRow effect chip is clicked we jump to the Effects tab
  // and scroll the matching entry into view. Setting focusEffect here
  // lets EffectsTab pick it up on mount and do the scroll once.
  const [focusEffect, setFocusEffect] = useState<string | null>(null);
  const openEffect = (effectType: string) => {
    setFocusEffect(effectType);
    setTab('effects');
  };

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
        {tab === 'skills' && <SkillsTab query={query} onOpenEffect={openEffect} />}
        {tab === 'items' && <ItemsTab query={query} />}
        {tab === 'tree' && <TreeTab query={query} />}
        {tab === 'classes' && <ClassesTab query={query} />}
        {tab === 'specs' && <SpecsTab query={query} />}
        {tab === 'races' && <RacesTab query={query} />}
        {tab === 'effects' && <EffectsTab query={query} focusType={focusEffect} />}
        {tab === 'quests' && <QuestsTab query={query} />}
      </div>
    </section>
  );
}

function filterMatch(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function SkillsTab({ query, onOpenEffect }: { query: string; onOpenEffect: (effectType: string) => void }) {
  const rows = useMemo(() => Object.values(SKILLS).filter((s) =>
    filterMatch(`${s.name} ${s.description} ${s.kind ?? ''}`, query),
  ), [query]);
  return (
    <ul className="wiki-list">
      {rows.map((skill) => <SkillRow key={skill.id} skill={skill} onOpenEffect={onOpenEffect} />)}
    </ul>
  );
}

function SkillRow({ skill, onOpenEffect }: { skill: SkillDef; onOpenEffect: (effectType: string) => void }) {
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
                  onClick={() => onOpenEffect(e.type)}
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
        {item.attackPower !== undefined && <Pair k="Atk Pwr" v={`+${item.attackPower}`} />}
        {item.defenseValue !== undefined && item.defenseValue > 0 && <Pair k="Def Val" v={`+${item.defenseValue}`} />}
        {item.equip && <Pair k="Slot" v={(item.equip.allowedSlots ?? []).join(', ')} />}
        {item.equip?.handUsage && <Pair k="Hands" v={item.equip.handUsage} />}
        {item.weight && <Pair k="Weight" v={`${(item.weight / 1000).toFixed(1)} kg`} />}
        {item.healAmount && <Pair k="Heals" v={`${item.healAmount} HP`} />}
        {item.manaAmount && <Pair k="Restores" v={`${item.manaAmount} MP`} />}
        {item.setId && <Pair k="Set" v={item.setId} />}
        {item.grade && item.grade !== 'none' && <Pair k="Grade" v={item.grade.toUpperCase()} />}
      </dl>
    </li>
  );
}

function TreeTab({ query }: { query: string }) {
  const races = Object.keys(RACE_PROFILES) as CharacterRace[];
  return (
    <ul className="wiki-tree">
      {races.map((race) => <RaceTreeRow key={race} race={race} query={query} />)}
    </ul>
  );
}

function RaceTreeRow({ race, query }: { race: CharacterRace; query: string }) {
  const profile = RACE_PROFILES[race];
  const visible = profile.allowedClasses.filter((cls) =>
    filterMatch(`${race} ${profile.name} ${cls} ${CLASS_SKILL_TREES[cls]?.description ?? ''}`, query),
  );
  if (visible.length === 0) return null;
  return (
    <li className="wiki-tree-node wiki-tree-node--root">
      <span className="wiki-tree-label"><strong>{profile.name}</strong></span>
      <ul className="wiki-tree-children">
        {visible.map((cls) => <ClassTreeRow key={cls} cls={cls} />)}
      </ul>
    </li>
  );
}

function ClassTreeRow({ cls }: { cls: CharacterClass }) {
  const passive = CLASS_PASSIVES[cls];
  const specs = Object.values(SPECIALIZATIONS).filter((s) => s.baseClass === cls);
  return (
    <li className="wiki-tree-node">
      <span className="wiki-tree-label">{capitalize(cls)}</span>
      <ul className="wiki-tree-children">
        {passive && (
          <li className="wiki-tree-node wiki-tree-node--leaf">
            <span className="wiki-tree-label" title={passive.description}>Passive: {passive.name}</span>
          </li>
        )}
        {specs.map((spec) => (
          <li key={spec.id} className="wiki-tree-node">
            <span className="wiki-tree-label" title={spec.description}>Spec: {spec.name}</span>
            <ul className="wiki-tree-children">
              <li className="wiki-tree-node wiki-tree-node--leaf">
                <span className="wiki-tree-label" title={spec.specializationPassive.description}>
                  → {spec.specializationPassive.name} (Lv {spec.unlockLevel})
                </span>
              </li>
              <li className="wiki-tree-node wiki-tree-node--leaf">
                <span className="wiki-tree-label" title={spec.proficiencyPassive.description}>
                  → {spec.proficiencyPassive.name} (Lv {spec.proficiencyLevel})
                </span>
              </li>
            </ul>
          </li>
        ))}
      </ul>
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
  const skillIds = Object.keys(tree?.skillProgression ?? {}) as Array<keyof typeof SKILLS>;
  const skillNames = skillIds.map((id) => SKILLS[id]?.name ?? id).join(', ');
  const races = (Object.keys(RACE_PROFILES) as CharacterRace[]).filter((r) =>
    RACE_PROFILES[r].allowedClasses.includes(cls),
  );
  return (
    <li className="wiki-row">
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
        Tree: {skillNames}
      </small>
      <small className="wiki-row-footer">
        Races: {races.length ? races.map((r) => RACE_PROFILES[r].name).join(', ') : '—'}
      </small>
    </li>
  );
}

function SpecsTab({ query }: { query: string }) {
  const rows = useMemo(() => Object.values(SPECIALIZATIONS).filter((s) =>
    filterMatch(
      `${s.name} ${s.baseClass} ${s.description} ${s.specializationPassive.name} ${s.proficiencyPassive.name}`,
      query,
    ),
  ), [query]);
  return (
    <ul className="wiki-list">
      {rows.map((spec) => <SpecRow key={spec.id} spec={spec} />)}
    </ul>
  );
}

function SpecRow({ spec }: { spec: Specialization }) {
  const specSkills = (spec.specSkills ?? []).map((id) => SKILLS[id]?.name ?? id).join(', ');
  const profSkills = (spec.proficiencySkills ?? []).map((id) => SKILLS[id]?.name ?? id).join(', ');
  return (
    <li className="wiki-row">
      <header>
        <strong>{spec.name}</strong>
        <span className="wiki-row-tag">{capitalize(spec.baseClass)}</span>
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
      {specSkills && <small className="wiki-row-footer">Spec skills: {specSkills}</small>}
      {profSkills && <small className="wiki-row-footer">Proficiency skills: {profSkills}</small>}
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

function EffectsTab({ query, focusType }: { query: string; focusType: string | null }) {
  const rows = useMemo(() => (Object.values(EFFECT_SPECS) as EffectSpec[]).filter((e) =>
    filterMatch(`${e.label} ${e.description} ${e.category}`, query),
  ), [query]);
  const focusRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    // Scroll the focused row into view once after the tab opens. Doesn't
    // re-fire on query changes — only when focusType is set by the
    // SkillRow chip click.
    if (focusType && focusRef.current) {
      focusRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusType]);
  return (
    <ul className="wiki-list">
      {rows.map((effect) => (
        <li
          key={effect.type}
          ref={effect.type === focusType ? focusRef : undefined}
          className={`wiki-row${effect.type === focusType ? ' wiki-row--focus' : ''}`}
        >
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

function QuestsTab({ query }: { query: string }) {
  const rows = useMemo(() => Object.values(QUESTS).filter((q) =>
    filterMatch(`${q.name} ${q.description} ${q.npcId}`, query),
  ), [query]);
  return (
    <ul className="wiki-list">
      {rows.map((quest) => <QuestRow key={quest.id} quest={quest} />)}
    </ul>
  );
}

function QuestRow({ quest }: { quest: QuestDef }) {
  const giver = QUEST_NPCS[quest.npcId];
  return (
    <li className="wiki-row">
      <header>
        <strong>{quest.name}</strong>
        <span className="wiki-row-tag">Lv {quest.minLevel}+</span>
      </header>
      <p>{quest.description}</p>
      {giver && <small className="wiki-row-footer">Giver: {giver.name} ({giver.title})</small>}
      <small className="wiki-row-footer">Stages: {quest.stages.length}</small>
      <small className="wiki-row-footer">
        Reward:
        {quest.reward.xp ? ` ${quest.reward.xp} XP` : ''}
        {quest.reward.gold ? ` · ${quest.reward.gold} gold` : ''}
        {quest.reward.items?.length ? ` · ${quest.reward.items.map((i) => `${i.itemId}×${i.quantity ?? 1}`).join(', ')}` : ''}
      </small>
    </li>
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
