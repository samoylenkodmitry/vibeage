# VibeAge

A 3D browser-based MMORPG inspired by Lineage 2, built with modern web technologies. The name combines "vibe coding" philosophy with the legacy of classic MMORPGs.

## Current State: Single Player Proof of Concept

Currently implemented features:
- 3D world with dynamic zones and environments
- Character creation and progression
- Combat system with various skills and abilities
- Status effects and damage over time mechanics
- Zone-based enemy spawning and respawn system
- Level progression and experience system

## Roadmap to MMORPG

### Phase 1: Infrastructure
- [ ] Server-side state management
- [ ] Player data persistence
- [ ] Authentication system
- [ ] Basic chat system

### Phase 2: Multiplayer Core
- [ ] Real-time player synchronization
- [ ] Player-to-player interaction
- [ ] Improved zone management for multiple players
- [ ] Basic party system

### Phase 3: MMORPG Features
- [ ] Enhanced chat (global, zone, party, private)
- [ ] Trading system
- [ ] Group content (dungeons, raids)
- [ ] Guild system
- [ ] Player economy

## Tech Stack

- **Frontend**: Next.js, Three.js, React Three Fiber
- **State Management**: Zustand
- **Physics**: Rapier
- **3D UI**: React Three Drei

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to play the game.

## Contributing

We welcome contributions! Feel free to submit issues and pull requests.

## License

This project is MIT licensed.
