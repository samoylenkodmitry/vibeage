import { useState } from 'react';
import { CLASS_SKILL_TREES } from '../../../../packages/content/classes';
import { ITEMS } from '../../../../packages/content/items';
import { CHARACTER_RACES } from '../../../../packages/content/races';
import { SPECIALIZATIONS } from '../../../../packages/content/specializations';
import { SKILLS } from '../../../../packages/content/skills';
import type { PlayerEntity } from '../gameTypes';
import { useDraggablePanel } from './useDraggablePanel';

type GmVerb =
  | 'grantXp' | 'grantGold' | 'grantSp' | 'grantItem' | 'grantSkill'
  | 'setLevel' | 'setRace' | 'setClass' | 'setSpecialization';

type GmCmd = {
  verb: GmVerb;
  value: number | string;
  targetId?: string;
  quantity?: number;
};

type GmPanelProps = {
  player: PlayerEntity | null;
  selectedPlayerId: string | null;
  onGmCommand: (cmd: GmCmd) => void;
};

/**
 * GM panel. Lets the operator grant resources / items / skills and
 * set identity (level, race, class, spec) on themselves or the
 * currently selected player. The server enforces GM access with
 * VIBEAGE_ENABLE_DEV_COMMANDS or VIBEAGE_GM_ACCOUNTS and reports
 * rejected commands through CommandRejected.
 *
 * Pure data-driven UI: race / class / spec dropdowns iterate the
 * content catalogs so adding content lands here automatically.
 */
export function GmPanel({ player, selectedPlayerId, onGmCommand }: GmPanelProps) {
  const panelRef = useDraggablePanel<HTMLElement>('gm');
  const [useSelected, setUseSelected] = useState(false);
  const canTargetSelected = Boolean(selectedPlayerId);
  const targetId = useSelected && selectedPlayerId ? selectedPlayerId : undefined;
  const targetLabel = targetId ?? (player ? `${player.name} (self)` : 'self');
  const send = (verb: GmVerb, value: number | string, quantity?: number) =>
    onGmCommand({ verb, value, targetId, quantity });
  return (
    <section ref={panelRef} className="gm-panel" aria-label="GM Panel">
      <div className="panel-title">
        <strong>GM</strong>
        <span>{targetLabel}</span>
      </div>
      <label className="gm-row">
        <input
          type="checkbox"
          checked={useSelected && canTargetSelected}
          disabled={!canTargetSelected}
          onChange={(e) => setUseSelected(e.target.checked)}
        />
        Target selected player
      </label>
      <NumberVerb label="Grant XP" verb="grantXp" defaultValue={100} send={send} />
      <NumberVerb label="Grant Gold" verb="grantGold" defaultValue={100} send={send} />
      <NumberVerb label="Grant SP" verb="grantSp" defaultValue={1} send={send} />
      <NumberVerb label="Set Level" verb="setLevel" defaultValue={20} send={send} />
      <ItemVerb send={send} />
      <SkillVerb send={send} />
      <DropdownVerb
        label="Set Race"
        verb="setRace"
        options={CHARACTER_RACES.map((r) => ({ value: r, label: r }))}
        send={send}
      />
      <DropdownVerb
        label="Set Class"
        verb="setClass"
        options={Object.keys(CLASS_SKILL_TREES).map((c) => ({ value: c, label: c }))}
        send={send}
      />
      <DropdownVerb
        label="Set Spec"
        verb="setSpecialization"
        options={[
          { value: 'none', label: '— none —' },
          ...Object.values(SPECIALIZATIONS).map((s) => ({ value: s.id, label: `${s.name} (${s.baseClass})` })),
        ]}
        send={send}
      />
    </section>
  );
}

type Verb = GmVerb;

function NumberVerb({
  label, verb, defaultValue, send,
}: {
  label: string;
  verb: Verb;
  defaultValue: number;
  send: (verb: Verb, value: number | string, quantity?: number) => void;
}) {
  const [v, setV] = useState<number>(defaultValue);
  return (
    <div className="gm-row">
      <span className="gm-row-label">{label}</span>
      <input type="number" value={v} onChange={(e) => setV(Number(e.target.value))} className="gm-row-input" />
      <button type="button" onClick={() => send(verb, v)}>Apply</button>
    </div>
  );
}

function ItemVerb({ send }: { send: (verb: Verb, value: number | string, quantity?: number) => void }) {
  const itemIds = Object.keys(ITEMS);
  const [item, setItem] = useState(itemIds[0] ?? '');
  const [qty, setQty] = useState(1);
  return (
    <div className="gm-row">
      <span className="gm-row-label">Grant Item</span>
      <select value={item} onChange={(e) => setItem(e.target.value)} className="gm-row-input">
        {itemIds.map((id) => <option key={id} value={id}>{id}</option>)}
      </select>
      <input type="number" value={qty} min={1} onChange={(e) => setQty(Number(e.target.value))} className="gm-row-input gm-row-input--small" />
      <button type="button" onClick={() => send('grantItem', item, qty)}>Apply</button>
    </div>
  );
}

function SkillVerb({ send }: { send: (verb: Verb, value: number | string, quantity?: number) => void }) {
  const ids = Object.keys(SKILLS);
  const [sid, setSid] = useState(ids[0] ?? '');
  return (
    <div className="gm-row">
      <span className="gm-row-label">Grant Skill</span>
      <select value={sid} onChange={(e) => setSid(e.target.value)} className="gm-row-input">
        {ids.map((id) => <option key={id} value={id}>{SKILLS[id as keyof typeof SKILLS]?.name ?? id}</option>)}
      </select>
      <button type="button" onClick={() => send('grantSkill', sid)}>Apply</button>
    </div>
  );
}

function DropdownVerb({
  label, verb, options, send,
}: {
  label: string;
  verb: Verb;
  options: ReadonlyArray<{ value: string; label: string }>;
  send: (verb: Verb, value: number | string, quantity?: number) => void;
}) {
  const [v, setV] = useState(options[0]?.value ?? '');
  return (
    <div className="gm-row">
      <span className="gm-row-label">{label}</span>
      <select value={v} onChange={(e) => setV(e.target.value)} className="gm-row-input">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <button type="button" onClick={() => send(verb, v)}>Apply</button>
    </div>
  );
}
