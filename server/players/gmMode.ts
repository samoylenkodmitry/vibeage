/**
 * GM (Game Master) gate. In the current state of the project every
 * player connecting against a server with `VIBEAGE_ENABLE_DEV_COMMANDS=1`
 * is implicitly a GM — same env flag the existing devTeleport
 * handler uses, so we don't introduce a second admin permission
 * surface for now. Once auth lands (ROADMAP 4) this can switch to
 * per-account flags.
 *
 * Used to gate:
 *  - in-world `SelectRace` (race is creation-time only for normal
 *    players; PR D2 puts that flow in the lobby)
 *  - in-world `SelectClass` (same reasoning)
 *  - GM verbs added by PR F (grant xp/gold/sp/items/skills, set
 *    level/spec, etc).
 */
export function isGmModeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VIBEAGE_ENABLE_DEV_COMMANDS === '1';
}
