import { useEffect, useRef, useState } from 'react';
import { playCue } from '../sfx';

type GainBurstProps = {
  /** Player's current XP total — watched for upward deltas. */
  experience: number;
  /** Player's gold — watched for upward deltas. */
  gold: number;
  /** Player's unspent skill-point balance — watched for upward deltas. */
  skillPoints: number;
};

type Burst = {
  id: number;
  label: string;
  flavor: 'xp' | 'gold' | 'sp';
};

/**
 * Tiny floating "+25 XP" / "+100 gold" bursts above the player
 * vitals strip whenever the local player's experience or gold
 * total ticks up. Pure HTML/CSS — no Three.js. Stacks vertically
 * if multiple bursts land in the same tick.
 */
export function GainBurst({ experience, gold, skillPoints }: GainBurstProps) {
  const lastXpRef = useRef(experience);
  const lastGoldRef = useRef(gold);
  const lastSpRef = useRef(skillPoints);
  const seqRef = useRef(0);
  const [bursts, setBursts] = useState<Burst[]>([]);

  useEffect(() => {
    const additions: Burst[] = [];
    const xpDelta = experience - lastXpRef.current;
    if (xpDelta > 0) {
      additions.push({ id: ++seqRef.current, label: `+${xpDelta} XP`, flavor: 'xp' });
    }
    lastXpRef.current = experience;
    const goldDelta = gold - lastGoldRef.current;
    if (goldDelta > 0) {
      additions.push({ id: ++seqRef.current, label: `+${goldDelta} gold`, flavor: 'gold' });
    }
    lastGoldRef.current = gold;
    const spDelta = skillPoints - lastSpRef.current;
    if (spDelta > 0) {
      additions.push({ id: ++seqRef.current, label: `+${spDelta} SP`, flavor: 'sp' });
    }
    lastSpRef.current = skillPoints;
    if (additions.length === 0) return;
    setBursts((prev) => [...prev, ...additions]);
    playCue('pickup');
    // Auto-remove each burst after the animation completes.
    const timers = additions.map((b) =>
      window.setTimeout(() => {
        setBursts((prev) => prev.filter((x) => x.id !== b.id));
      }, 1600),
    );
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [experience, gold, skillPoints]);

  if (bursts.length === 0) return null;
  return (
    <div className="gain-burst-stack" aria-live="polite">
      {bursts.map((b) => (
        <span key={b.id} className={`gain-burst gain-burst--${b.flavor}`}>{b.label}</span>
      ))}
    </div>
  );
}
