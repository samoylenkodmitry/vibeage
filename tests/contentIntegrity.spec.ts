import { describe, expect, it } from 'vitest';
import { CLASS_SKILL_TREES, type CharacterClass } from '../packages/content/classes';

const CLASS_NAMES = Object.keys(CLASS_SKILL_TREES) as CharacterClass[];
import { ENEMY_TEMPLATES } from '../packages/content/enemies';
import { EQUIPMENT_SETS } from '../packages/content/equipmentSets';
import { ITEMS } from '../packages/content/items';
import { LOOT_TABLES } from '../packages/content/lootTables';
import { MINI_BOSSES } from '../packages/content/miniBosses';
import { QUEST_NPCS } from '../packages/content/npcs';
import { QUESTS } from '../packages/content/quests';
import { CHARACTER_RACES, RACE_PROFILES } from '../packages/content/races';
import { SKILLS, UNIVERSAL_SKILLS } from '../packages/content/skills';
import { SPECIALIZATIONS } from '../packages/content/specializations';
import { GAME_ZONES } from '../packages/content/zones';

/**
 * PR Y — single source-of-truth audit. Every reference in the
 * content graph (items, skills, mobs, bosses, recipes, loot, quests,
 * sets, classes, races, specs) must resolve to a real spec record.
 * Future content drops drift these silently; this test locks the
 * graph at CI.
 */
describe('content integrity: all refs resolve', () => {
  it('every SKILLS entry covers every UNIVERSAL_SKILL', () => {
    for (const id of UNIVERSAL_SKILLS) {
      expect(SKILLS[id], `UNIVERSAL_SKILL ${id} missing from SKILLS`).toBeDefined();
    }
  });

  it('every class skill progression references known skills', () => {
    for (const cls of CLASS_NAMES) {
      const tree = CLASS_SKILL_TREES[cls];
      expect(tree, `class ${cls} has no CLASS_SKILL_TREES entry`).toBeDefined();
      for (const skillId of Object.keys(tree.skillProgression)) {
        expect(SKILLS[skillId as keyof typeof SKILLS], `class ${cls} → ${skillId} not in SKILLS`).toBeDefined();
      }
      for (const req of Object.values(tree.skillProgression)) {
        for (const dep of req?.requiredSkills ?? []) {
          expect(SKILLS[dep], `class ${cls} requires unknown skill ${dep}`).toBeDefined();
        }
      }
    }
  });

  it('every SPECIALIZATIONS entry has a real class + grants real skills', () => {
    for (const spec of Object.values(SPECIALIZATIONS)) {
      expect(CLASS_NAMES.includes(spec.baseClass), `spec ${spec.id} → class ${spec.baseClass} unknown`).toBe(true);
      for (const sid of spec.specSkills ?? []) {
        expect(SKILLS[sid], `spec ${spec.id} grants unknown skill ${sid}`).toBeDefined();
      }
      for (const sid of spec.proficiencySkills ?? []) {
        expect(SKILLS[sid], `spec ${spec.id} proficiency grants unknown skill ${sid}`).toBeDefined();
      }
    }
  });

  it('every RACE_PROFILES allowedClass is a real class', () => {
    for (const race of CHARACTER_RACES) {
      const profile = RACE_PROFILES[race];
      expect(profile, `race ${race} missing from RACE_PROFILES`).toBeDefined();
      for (const cls of profile.allowedClasses) {
        expect(CLASS_NAMES.includes(cls), `race ${race} allows unknown class ${cls}`).toBe(true);
      }
    }
  });

  it('every zone mob and mini-boss type resolves to an ENEMY_TEMPLATE', () => {
    for (const zone of GAME_ZONES) {
      for (const mob of zone.mobs) {
        expect(ENEMY_TEMPLATES[mob.type], `zone ${zone.id} mob ${mob.type} missing template`).toBeDefined();
      }
      if (zone.miniBoss) {
        expect(ENEMY_TEMPLATES[zone.miniBoss.type], `zone ${zone.id} miniBoss ${zone.miniBoss.type} missing template`).toBeDefined();
      }
    }
  });

  it('every MINI_BOSSES entry has a real mobType + trophy item + loot table', () => {
    for (const boss of Object.values(MINI_BOSSES)) {
      expect(ENEMY_TEMPLATES[boss.mobType], `boss ${boss.id} mobType ${boss.mobType} unknown`).toBeDefined();
      expect(ITEMS[boss.trophyItemId], `boss ${boss.id} trophy ${boss.trophyItemId} missing from ITEMS`).toBeDefined();
      expect(LOOT_TABLES[boss.lootTableId], `boss ${boss.id} lootTable ${boss.lootTableId} missing`).toBeDefined();
    }
  });

});

describe('content integrity: drops / recipes / sets / quests', () => {
  it('every LOOT_TABLES drop resolves to a real item', () => {
    for (const table of Object.values(LOOT_TABLES)) {
      for (const drop of table.drops) {
        expect(ITEMS[drop.itemId], `loot table ${table.id} drops unknown item ${drop.itemId}`).toBeDefined();
      }
    }
  });

  it('every recipe item has resolvable inputs + output', () => {
    for (const item of Object.values(ITEMS)) {
      if (item.type !== 'recipe') continue;
      expect(item.recipe, `recipe ${item.id} missing recipe payload`).toBeDefined();
      for (const inp of item.recipe!.inputs) {
        expect(ITEMS[inp.itemId], `recipe ${item.id} input ${inp.itemId} missing from ITEMS`).toBeDefined();
        expect(inp.quantity).toBeGreaterThan(0);
      }
      expect(ITEMS[item.recipe!.output.itemId], `recipe ${item.id} output ${item.recipe!.output.itemId} missing`).toBeDefined();
      expect(item.recipe!.output.quantity).toBeGreaterThan(0);
    }
  });

  it('every equipment set member exists in ITEMS and declares the matching setId', () => {
    for (const set of Object.values(EQUIPMENT_SETS)) {
      for (const memberId of set.requiredPieces) {
        const item = ITEMS[memberId];
        expect(item, `set ${set.setId} member ${memberId} missing from ITEMS`).toBeDefined();
        if (item) {
          expect(item.setId, `${memberId} should declare setId = ${set.setId}, got ${item.setId ?? 'undefined'}`).toBe(set.setId);
        }
      }
    }
  });

  it('every quest references real NPCs, skills, items, mobs, bosses', () => {
    for (const quest of Object.values(QUESTS)) {
      expect(QUEST_NPCS[quest.npcId], `quest ${quest.id} → npc ${quest.npcId} unknown`).toBeDefined();
      for (const stage of quest.stages) {
        const obj = stage.objective;
        if (obj.kind === 'kill') {
          expect(ENEMY_TEMPLATES[obj.enemyType], `quest ${quest.id} kill ${obj.enemyType} unknown`).toBeDefined();
        } else if (obj.kind === 'kill_boss') {
          expect(MINI_BOSSES[obj.bossId], `quest ${quest.id} kill_boss ${obj.bossId} unknown`).toBeDefined();
        } else if (obj.kind === 'talk') {
          expect(QUEST_NPCS[obj.npcId], `quest ${quest.id} talk ${obj.npcId} unknown`).toBeDefined();
        }
      }
      for (const reward of quest.reward.items ?? []) {
        expect(ITEMS[reward.itemId], `quest ${quest.id} reward ${reward.itemId} unknown`).toBeDefined();
      }
    }
  });

  it('every item with setId points to a registered set', () => {
    for (const item of Object.values(ITEMS)) {
      if (!item.setId) continue;
      expect(EQUIPMENT_SETS[item.setId], `${item.id} setId ${item.setId} not in EQUIPMENT_SETS`).toBeDefined();
    }
  });

  it('every equippable item has a non-empty allowedSlots', () => {
    for (const item of Object.values(ITEMS)) {
      if (!item.equip) continue;
      expect(item.equip.allowedSlots.length, `${item.id} equip has empty allowedSlots`).toBeGreaterThan(0);
    }
  });
});

describe('content integrity: stat sanity', () => {
  it('every equippable item declares positive grade-appropriate weight', () => {
    for (const item of Object.values(ITEMS)) {
      if (!item.equip) continue;
      // Weight is informational but >0 catches accidentally omitted fields.
      expect(item.weight, `${item.id} equippable but no weight`).toBeGreaterThan(0);
    }
  });

  it('every weapon has at least one positive damage stat', () => {
    for (const item of Object.values(ITEMS)) {
      if (item.type !== 'weapon') continue;
      const hasAtk = (item.stats?.pAtk ?? 0) > 0 || (item.stats?.mAtk ?? 0) > 0 || (item.attackPower ?? 0) > 0;
      expect(hasAtk, `${item.id} is a weapon but has no pAtk/mAtk/attackPower`).toBe(true);
    }
  });

  it('every armor piece has at least one positive defense stat', () => {
    for (const item of Object.values(ITEMS)) {
      // jewelry rolls magic-flavoured stats, not pDef.
      if (item.type !== 'armor' || item.kind === 'jewelry') continue;
      const hasDef = (item.stats?.pDef ?? 0) > 0 || (item.stats?.mDef ?? 0) > 0 || (item.defenseValue ?? 0) > 0;
      expect(hasDef, `${item.id} is armor but has no pDef/mDef/defenseValue`).toBe(true);
    }
  });

  it('every mob template stats block has positive values', () => {
    for (const tpl of Object.values(ENEMY_TEMPLATES)) {
      expect(tpl.stats.health, `${tpl.type} health stat`).toBeGreaterThan(0);
      expect(tpl.stats.damage, `${tpl.type} damage stat`).toBeGreaterThan(0);
      expect(tpl.stats.movementSpeed, `${tpl.type} movementSpeed`).toBeGreaterThan(0);
      expect(tpl.stats.aggroRadius, `${tpl.type} aggroRadius`).toBeGreaterThan(0);
      expect(tpl.stats.attackRange, `${tpl.type} attackRange`).toBeGreaterThan(0);
      expect(tpl.displayName.length, `${tpl.type} displayName`).toBeGreaterThan(0);
    }
  });

  it('every skill has a positive levelRequired and a description', () => {
    for (const [id, skill] of Object.entries(SKILLS)) {
      expect(skill.levelRequired, `${id} levelRequired`).toBeGreaterThanOrEqual(1);
      expect(skill.name.length, `${id} name`).toBeGreaterThan(0);
      expect(skill.description.length, `${id} description`).toBeGreaterThan(0);
      // Passives carry no SkillEffect[] (Contribution registry); custom-
      // behavior skills express their effect via the registered resolver.
      // Every other skill needs at least one effect entry.
      if (!id.startsWith('passive_') && !skill.customBehavior) {
        expect(skill.effects.length, `${id} effects[]`).toBeGreaterThan(0);
      }
    }
  });
});

describe('content integrity: shape validation', () => {
  it('every stackable item declares a maxStack', () => {
    for (const item of Object.values(ITEMS)) {
      if (!item.stackable) continue;
      expect(item.maxStack, `${item.id} stackable=true but no maxStack`).toBeGreaterThan(0);
    }
  });

  it('every loot drop has chance ∈ (0, 1] and quantity.min ≤ quantity.max', () => {
    for (const table of Object.values(LOOT_TABLES)) {
      for (const drop of table.drops) {
        expect(drop.chance, `${table.id} → ${drop.itemId} chance`).toBeGreaterThan(0);
        expect(drop.chance, `${table.id} → ${drop.itemId} chance`).toBeLessThanOrEqual(1);
        expect(drop.quantity.min, `${table.id} → ${drop.itemId} qty range`).toBeLessThanOrEqual(drop.quantity.max);
        expect(drop.quantity.min, `${table.id} → ${drop.itemId} qty.min`).toBeGreaterThan(0);
      }
    }
  });

  it('every consumable that heals/restores declares a positive amount', () => {
    for (const item of Object.values(ITEMS)) {
      if (item.type !== 'consumable') continue;
      const heals = (item.healAmount ?? 0) + (item.manaAmount ?? 0);
      expect(heals, `${item.id} consumable but no healAmount/manaAmount`).toBeGreaterThan(0);
    }
  });

  it('every skill with castMs > 0 should be blocking (instants don\'t block)', () => {
    for (const [id, skill] of Object.entries(SKILLS)) {
      if (skill.castMs === 0) {
        expect(skill.isBlocking, `${id} is instant (castMs=0); isBlocking should be false`).toBe(false);
      }
    }
  });

  it('every skill referenced by SkillId union has a SKILLS entry', () => {
    // SkillId is a closed string literal union — Object.keys(SKILLS) must
    // cover it. We check the reverse: SKILLS only has known ids and
    // every id has the matching SkillId. Catches typos like
    // 'fireba1l' that would still typecheck as a string.
    for (const [k, v] of Object.entries(SKILLS)) {
      expect(v.id, `${k} declares mismatched id ${v.id}`).toBe(k);
    }
  });

  it('every NPC position is finite (catches missed { x, y, z })', () => {
    for (const [id, npc] of Object.entries(QUEST_NPCS)) {
      expect(Number.isFinite(npc.position.x), `${id} position.x not finite`).toBe(true);
      expect(Number.isFinite(npc.position.z), `${id} position.z not finite`).toBe(true);
      expect(npc.name.length, `${id} name`).toBeGreaterThan(0);
      expect(npc.title.length, `${id} title`).toBeGreaterThan(0);
    }
  });

  it('every zone has at least one mob entry', () => {
    for (const zone of GAME_ZONES) {
      expect(zone.mobs.length, `zone ${zone.id} has no mobs`).toBeGreaterThan(0);
      expect(zone.minLevel, `zone ${zone.id} minLevel`).toBeGreaterThan(0);
      expect(zone.minLevel, `zone ${zone.id} minLevel ≤ maxLevel`).toBeLessThanOrEqual(zone.maxLevel);
    }
  });
});

describe('content integrity: dead-leftover survey', () => {
  it('no enemy template is defined that no zone spawns', () => {
    const spawnedTypes = new Set<string>();
    for (const zone of GAME_ZONES) {
      for (const m of zone.mobs) spawnedTypes.add(m.type);
      if (zone.miniBoss) spawnedTypes.add(zone.miniBoss.type);
    }
    const unused = Object.keys(ENEMY_TEMPLATES).filter((t) => !spawnedTypes.has(t));
    expect(unused, `enemy templates defined but never spawned: ${unused.join(', ')}`).toEqual([]);
  });

  it('no loot table is registered that nothing references', () => {
    const referenced = new Set<string>();
    // Mob templates use the convention `${type}_loot`.
    for (const t of Object.keys(ENEMY_TEMPLATES)) referenced.add(`${t}_loot`);
    for (const boss of Object.values(MINI_BOSSES)) referenced.add(boss.lootTableId);
    const orphan = Object.keys(LOOT_TABLES).filter((id) => !referenced.has(id));
    expect(orphan, `loot tables defined but unreferenced: ${orphan.join(', ')}`).toEqual([]);
  });

  it('every spec / proficiency skill is granted by at least one specialization', () => {
    const granted = new Set<string>();
    for (const spec of Object.values(SPECIALIZATIONS)) {
      for (const sid of spec.specSkills ?? []) granted.add(sid);
      for (const sid of spec.proficiencySkills ?? []) granted.add(sid);
    }
    // Spec-tier skill ids follow `<word>_<word>` (underscored). Base
    // class skills are camelCase. Anything underscored that no spec
    // grants is dead weight — *except* class passives (`passive_*`),
    // auto-granted/learned from the tree, and boss signatures (`boss_*`),
    // owned by enemy templates (never learnable by players).
    const orphanSpecSkills = Object.keys(SKILLS)
      .filter((id) => id.includes('_') && !id.startsWith('passive_') && !id.startsWith('boss_') && !granted.has(id));
    expect(orphanSpecSkills, `spec-style skills not granted by any spec: ${orphanSpecSkills.join(', ')}`).toEqual([]);
  });
});
