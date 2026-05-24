import type { GameClientState, PlayerEntity } from '../gameTypes';
import { BossDefeatBanner } from './BossDefeatBanner';
import { BossEncounterBanner } from './BossEncounterBanner';
import { BossTelegraphBar } from './BossTelegraphBar';
import { BossTelegraphCue } from './BossTelegraphCue';
import { ChatReceiveCue } from './ChatReceiveCue';
import { CombatSfxBridge } from './CombatSfxBridge';
import { GainBurst } from './GainBurst';
import { HitShake } from './HitShake';
import { HurtVignette } from './HurtVignette';
import { KeybindCheatsheet } from './KeybindCheatsheet';
import { LevelUpBurst } from './LevelUpBurst';
import { LifeCueBridge } from './LifeCueBridge';
import { LowHealthHeartbeat } from './LowHealthHeartbeat';
import { LowManaCue } from './LowManaCue';
import { PageTitle } from './PageTitle';
import { QuestCompleteBurst } from './QuestCompleteBurst';
import { SfxMuteButton } from './SfxMuteButton';

type HudOverlaysProps = {
  state: GameClientState;
  player: PlayerEntity | null;
};

/**
 * Collected set of headless / floating HUD overlays that don't
 * belong in any specific panel: SFX controls, help cheatsheet,
 * combat sfx bridge, boss encounter/defeat/telegraph signals, and
 * the per-player feedback bursts. Pulled out of GameHud's render
 * to keep the parent function under the 100-line maintainability
 * gate (and the JSX readable).
 *
 * The split between always-mounted and player-conditional children
 * mirrors what GameHud used to do inline: bridges that act on
 * shared world state mount unconditionally; vitals-driven bursts
 * only mount once a player exists.
 */
export function HudOverlays({ state, player }: HudOverlaysProps) {
  return (
    <>
      <SfxMuteButton />
      <KeybindCheatsheet />
      <CombatSfxBridge enemies={state.enemies} visualEvents={state.visualEvents} />
      <BossEncounterBanner enemies={state.enemies} />
      <BossDefeatBanner enemies={state.enemies} />
      <BossTelegraphCue telegraphs={state.bossTelegraphs} />
      <BossTelegraphBar telegraphs={state.bossTelegraphs} />
      <ChatReceiveCue chatLines={state.chatLines} myPlayerId={state.myPlayerId} />
      {player && (
        <>
          <HurtVignette health={player.health} />
          <HitShake health={player.health} />
          <LifeCueBridge isAlive={player.isAlive} />
          <LowHealthHeartbeat
            health={player.health}
            maxHealth={player.maxHealth}
            isAlive={player.isAlive}
          />
          <LowManaCue mana={player.mana} maxMana={player.maxMana} isAlive={player.isAlive} />
          <PageTitle player={player} />
          <GainBurst
            experience={player.experience}
            gold={player.gold ?? 0}
            skillPoints={player.availableSkillPoints}
          />
          <LevelUpBurst level={player.level} />
          <QuestCompleteBurst completed={player.questState?.completed ?? []} />
        </>
      )}
    </>
  );
}
