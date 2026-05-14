import { spawnSync } from "node:child_process";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const serverTests = [
  "tests/authoritativeRoomAdapter.spec.ts",
  "tests/clientMessageRouter.spec.ts",
  "tests/colyseusRoomAdapter.spec.ts",
  "tests/combat.castHandler.spec.ts",
  "tests/combat.castMachine.spec.ts",
  "tests/combat.cooldowns.spec.ts",
  "tests/combat.projectileRuntime.spec.ts",
  "tests/enemyBehavior.spec.ts",
  "tests/enemyLifecycle.spec.ts",
  "tests/enemySpawning.spec.ts",
  "tests/groundLoot.spec.ts",
  "tests/inventorySlots.spec.ts",
  "tests/itemUse.spec.ts",
  "tests/lootRuntime.spec.ts",
  "tests/persistence.spec.ts",
  "tests/playerLifecycle.spec.ts",
  "tests/playerProgression.spec.ts",
  "tests/playerSession.spec.ts",
  "tests/runtimeMetrics.spec.ts",
  "tests/scenarioFixtures.spec.ts",
  "tests/serverRuntimeFlow.spec.ts",
  "tests/starterPath.spec.ts",
  "tests/transportBoundary.spec.ts",
  "tests/verticalSlice.spec.ts",
  "tests/worldMovement.spec.ts",
  "tests/worldTickPipeline.spec.ts",
  "tests/worldRegions.spec.ts",
  "tests/worldRoomLifecycle.spec.ts",
  "tests/worldStateSchema.spec.ts",
  "tests/zoneRuntime.spec.ts",
];

const clientTests = [
  "tests/clientCameraRig.spec.ts",
  "tests/viteClientReducer.spec.ts",
  "tests/worldVisuals.spec.ts",
];

const protocolTests = [
  "tests/protocol.schemas.spec.ts",
  "tests/clientMessageRouter.spec.ts",
  "tests/clientSnapshot.spec.ts",
  "tests/clientStatePrivacy.spec.ts",
  "tests/outboundEvents.spec.ts",
  "tests/transportBoundary.spec.ts",
];

const contentTests = [
  "tests/worldContentValidation.spec.ts",
  "tests/verticalSlice.spec.ts",
  "tests/starterPath.spec.ts",
  "tests/enemySpawning.spec.ts",
];

const suites = {
  server: [
    step("lint server and shared runtime", ["exec", "eslint", "apps/server", "server", "packages", "tests", "--max-warnings=0"]),
    step("typecheck server", ["run", "typecheck:server"]),
    step("test server runtime", ["exec", "vitest", "run", ...serverTests]),
    step("build server", ["run", "build:server"]),
  ],
  client: [
    step("lint client and shared runtime", ["exec", "eslint", "apps/client", "packages", ...clientTests, "--max-warnings=0"]),
    step("typecheck Vite client", ["exec", "tsc", "-p", "apps/client/tsconfig.json", "--noEmit"]),
    step("test client reducers and visuals", ["exec", "vitest", "run", ...clientTests]),
    step("build client", ["run", "build"]),
  ],
  protocol: [
    step("lint protocol boundary", [
      "exec",
      "eslint",
      "packages/protocol",
      "server/transport",
      "server/world/clientMessageRouter.ts",
      "apps/client/src/roomConnection.ts",
      ...protocolTests,
      "--max-warnings=0",
    ]),
    step("strict typecheck packages", ["run", "typecheck:packages"]),
    step("typecheck server protocol users", ["run", "typecheck:server"]),
    step("typecheck client protocol users", ["exec", "tsc", "-p", "apps/client/tsconfig.json", "--noEmit"]),
    step("test protocol boundary", ["exec", "vitest", "run", ...protocolTests]),
  ],
  content: [
    step("lint content boundary", [
      "exec",
      "eslint",
      "packages/content",
      "server/gameplay",
      "scripts/check-content.ts",
      ...contentTests,
      "--max-warnings=0",
    ]),
    step("strict typecheck packages", ["run", "typecheck:packages"]),
    step("validate content", ["run", "content:check"]),
    step("test content behavior", ["exec", "vitest", "run", ...contentTests]),
  ],
};

const suiteName = process.argv[2];

if (!suiteName || !suites[suiteName]) {
  console.error(`Usage: node scripts/check-scope.mjs <${Object.keys(suites).join("|")}>`);
  process.exit(1);
}

for (const command of suites[suiteName]) {
  runStep(command);
}

function step(label, args) {
  return { label, args };
}

function runStep({ label, args }) {
  console.log(`\n[check:${suiteName}] ${label}`);
  console.log(`$ ${pnpm} ${args.join(" ")}`);

  const result = spawnSync(pnpm, args, {
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
