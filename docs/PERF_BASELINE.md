# VibeAge Performance Baseline

Single-config snapshot from the in-process load test, captured to give future PRs a comparison point. Re-run the harness on your branch and eyeball the same numbers (or commit a fresh baseline) when you suspect a perf regression.

This file is intentionally manual: numbers vary by machine and the harness is meaningful for trend tracking, not absolute SLA. If you commit a refreshed baseline, name the machine class in the row (`Belgrade workstation`, `CI runner`, etc.) and the date so future readers can recalibrate.

## How to run

```bash
LOAD_PLAYERS=50 LOAD_TICKS=600 LOAD_COMBAT=1 pnpm run load:inprocess
```

- 50 simulated players, 600 ticks at 30 Hz (≈ 20 s of simulated wall time).
- `LOAD_COMBAT=1` exercises CastReq → impact → damage so the AI / combat phases show up alongside snapshot / movement.
- No DB, no WebSocket — pure server tick work. The snapshot phase still calls `JSON.stringify` so `snapshot.batchBytes` is real.

Full reference for the harness lives in [QUALITY_GATES.md](QUALITY_GATES.md#load-test-tooling-52-12). Also see `scripts/load-test-sweep.ts` for the multi-N variant (default `LOAD_SWEEP=10,50,100`).

## Snapshots

### 2026-05-22 — main @ ~PR #472, Belgrade workstation

```
config: 50 players, 600 ticks @ 30Hz, LOAD_COMBAT=1
world:  108 spawned enemies, 8 active zones

runtime:
  elapsedMs            ~1100   (vs 20000 ms realtime budget — 5.6 % of budget)
  averageTickMs        1.69
  tick p50 / p95 / p99 1.64 / 1.92 / 2.19 ms

phases (avg, ms):
  inputMovement        0.07
  enemyAi              ~1.48
  snapshot             ~0.13
  maintenance          0.03

snapshot:
  batches/sec          7
  batch size p95       109 entities
  batch bytes p95      ~48 KB

outbound:
  total / sec          ~766
  playerUpdated / sec  ~372
  posSnap (batched)/s  ~358
  castReq accepted/s   ~2.65

memory:
  RSS delta            ~9 MB
  heap delta           ~-1 MB (GC during run)
  RSS final            ~130 MB
```

Read: a 50-player tick costs ~2 ms p95 on this machine; the server has plenty of headroom (33 ms tick budget). Snapshot bytes p95 around 48 KB at 50 players. Phase breakdown shows `enemyAi` dominates at the simulated 60 players + 108 enemies + 1-cast-per-bot-per-2s.

A future regression would surface here as either:
- `tick.p95` climbing toward the 33 ms budget — would matter at much larger N
- `snapshot.batchBytes p95` climbing — too much data per broadcast
- `enemyAi` average doubling — AI work is doing too much per tick
- `RSS delta` significantly higher — memory leak
