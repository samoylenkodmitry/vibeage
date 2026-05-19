import { useEffect, useMemo, useRef } from 'react';
import { ENEMY_TEMPLATES } from '../../../../packages/content/enemies';
import { ITEMS } from '../../../../packages/content/items';
import {
  DEFAULT_BOSS_CONFIG,
  listMiniBosses,
  type MiniBossSpec,
} from '../../../../packages/content/miniBosses';
import { GAME_ZONES } from '../../../../packages/content/zones';
import { LootDropsForTable } from './WikiLoot';

export type WikiNav = (tab: WikiBossesNavTab, id: string) => void;
type WikiBossesNavTab = 'bosses' | 'items' | 'mobs' | 'recipes' | 'sets' | 'npcs' | 'quests';

/**
 * Wiki "Bosses" tab. Lifted out of WikiPanel.tsx to keep that file
 * under the 700-line maintainability cap. Renders one card per
 * mini-boss with lore + signature ability + cross-links to the
 * boss's trophy (Items tab) and base mob (Mobs tab).
 */
export function BossesTab({
  query, focusId, focusKey, navigate,
}: { query: string; focusId: string | null; focusKey: string; navigate: WikiNav }) {
  const rows = useMemo(() => listMiniBosses().filter((b) =>
    matches(`${b.id} ${b.name} ${b.mobType} ${b.zoneHint} ${b.signatureAbility.name}`, query),
  ), [query]);
  return (
    <ul className="wiki-list">
      {rows.map((boss) => (
        <BossLi key={boss.id} boss={boss} isFocus={boss.id === focusId} focusKey={focusKey} navigate={navigate} />
      ))}
    </ul>
  );
}

function BossLi({
  boss, isFocus, focusKey, navigate,
}: { boss: MiniBossSpec; isFocus: boolean; focusKey: string; navigate: WikiNav }) {
  const ref = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (isFocus && focusKey && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isFocus, focusKey]);
  const trophy = ITEMS[boss.trophyItemId];
  // PR DD — derive HP / damage / level from the same constants
  // createEnemy uses, so the wiki numbers match what spawns. The
  // zone gives baseLevel + the boss adds levelBonus on top.
  const zone = GAME_ZONES.find((z) => z.miniBoss?.id === boss.id);
  const tpl = ENEMY_TEMPLATES[boss.mobType];
  const baseLevel = zone?.minLevel ?? 1;
  const levelBonus = zone?.miniBoss?.levelBonus ?? 0;
  const healthMult = zone?.miniBoss?.healthMultiplier ?? 1;
  const damageMult = zone?.miniBoss?.damageMultiplier ?? 1;
  const level = baseLevel + levelBonus;
  const hp = tpl ? Math.round((100 + level * 20) * tpl.stats.health * healthMult) : 0;
  const dmg = tpl ? Math.round((10 + level * 2) * tpl.stats.damage * damageMult) : 0;
  const eng = boss.signatureAbility.engine;
  return (
    <li ref={ref} className={`wiki-row${isFocus ? ' wiki-row--focus' : ''}`}>
      <header>
        <strong>{boss.name}</strong>
        <span className="wiki-row-tag">{boss.zoneHint}</span>
      </header>
      <p>{boss.lore}</p>
      <small className="wiki-row-footer">
        Lv {level}: <strong>{hp}</strong> HP · <strong>{dmg}</strong> melee dmg
      </small>
      <div className="wiki-pair">
        <dt>Signature: {boss.signatureAbility.name}</dt>
        <dd>{boss.signatureAbility.description}</dd>
      </div>
      <small className="wiki-row-footer">
        {(eng.windUpMs / 1000).toFixed(1)}s wind-up · {eng.radiusUnits}m radius ·{' '}
        ×{eng.damageMul} damage · {(eng.cooldownMs / 1000).toFixed(0)}s cooldown
      </small>
      <small className="wiki-row-footer">
        Enrages after {(DEFAULT_BOSS_CONFIG.enrageAfterMs / 1000).toFixed(0)}s
        {' '}(×{DEFAULT_BOSS_CONFIG.enragedDamageMul} damage); phase 2 below
        {' '}{(DEFAULT_BOSS_CONFIG.phaseTwoHpFraction * 100).toFixed(0)}% HP
        {' '}(×{DEFAULT_BOSS_CONFIG.phaseTwoSpeedMul} speed, ×{DEFAULT_BOSS_CONFIG.phaseTwoDamageMul} damage)
      </small>
      <small className="wiki-row-footer">
        Mob:{' '}
        <button type="button" className="wiki-effect-chip" onClick={() => navigate('mobs', boss.mobType)}>
          {boss.mobType}
        </button>
        {trophy && (
          <>
            {' · Trophy: '}
            <button type="button" className="wiki-effect-chip" onClick={() => navigate('items', trophy.id)}>
              {trophy.name}
            </button>
          </>
        )}
      </small>
      <LootDropsForTable tableId={boss.lootTableId} navigate={navigate} />
    </li>
  );
}

function matches(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}
