# Phase 0 Baseline and Reproducible Failures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a trustworthy baseline and add failing, user-visible reproductions for the six highest-risk current defects before any production behavior changes.

**Architecture:** Keep production files untouched in this phase. Add only test files and test-only fixtures, using the existing Node test runner and real command/player modules with external Discord and Lavalink boundaries replaced by complete, specific doubles.

**Tech Stack:** Node.js 20+, ESM, `node:test`, `node:assert/strict`, existing `src/` modules.

**Spec:** `docs/superpowers/specs/2026-09-24-auralyn-stabilization-and-full-roadmap-design.md`

## Global Constraints

- No production file may change in Phase 0.
- Every regression test must name the production mutation it catches.
- Every expected value must be a literal or hand-derived fixture, never computed by the code under test.
- Do not assert only that a fake was called; assert the observable player, store, response, or command result.
- Do not make network calls.
- Run the existing suite before adding regression tests and record its result.
- A RED result is expected for each new regression test and must be preserved as evidence.
- Update `test/AGENTS.md` only after the new test structure is written and verified.
- Do not commit unless explicitly requested.

---

### Task 0: Capture the untouched baseline

**Files:**
- Read: `package.json`
- Read: `test/AGENTS.md`
- Read: all existing `test/*.test.js`
- Modify: none

**Interfaces:**
- Consumes: the current working tree and existing `npm test` script.
- Produces: a recorded baseline of passing/failing tests, command count, and test count for later comparison.

- [ ] **Step 1: Inspect repository instructions and current state**

Run:

```bash
git status --short --branch
git log --oneline -10
```

Record the output without staging or changing files.

- [ ] **Step 2: Run the existing suite before adding tests**

Run:

```bash
npm test
```

Expected: the current suite result is recorded. Do not change source or tests to make this result green.

- [ ] **Step 3: Record structural inventory**

Run a read-only Node command that lists `src/commands/*.js` and `test/*.test.js` counts. Preserve the literal counts in the execution report; do not create a generated inventory file.

- [ ] **Step 4: Check the baseline diff**

Run:

```bash
git diff --check
git diff --stat
```

Expected: no tracked changes before regression-test work begins.

---

### Task 1: Add test-only interaction and member fixtures

**Files:**
- Create: `test/helpers/discord-interaction.js`
- Modify: `test/AGENTS.md`

**Interfaces:**
- Produces:
  - `createMember({ id, roleIds, channelId, admin })` returning a member with Discord-shaped `voice`, `roles`, and `permissions` fields.
  - `createButtonInteraction({ customId, guildId, userId, member, channelId, messageId, isDeferred, isReplied })` returning a button interaction with `isButton()`, `customId`, `guildId`, `user`, `member`, `deferUpdate()`, `deferReply()`, `editReply()`, `reply()`, and `followUp()` methods that record their payloads.
  - `createChatInputInteraction({ commandName, guildId, userId, member, options, channel })` returning a chat-input interaction with `isChatInputCommand()` and Discord-shaped option accessors.
- Consumes: no production module.
- The helper must not contain production-only cleanup methods or network behavior.

- [ ] **Step 1: Write the helper with explicit test-only boundaries**

Use this public shape:

```js
export function createMember({ id = 'user-1', roleIds = [], channelId = 'voice-1', admin = false } = {}) {
  return {
    id,
    voice: { channelId, channel: channelId ? { id: channelId } : null },
    roles: { cache: new Map(roleIds.map(roleId => [roleId, { id: roleId }])) },
    permissions: { has: permission => admin && permission === 'Administrator' },
  };
}

export function createButtonInteraction({
  customId,
  guildId = 'guild-1',
  userId = 'user-1',
  member = createMember(),
  channelId = 'text-1',
  messageId = 'message-1',
} = {}) {
  const calls = { replies: [], edits: [], follows: [], defers: [] };
  return {
    calls,
    customId,
    guildId,
    channelId,
    message: { id: messageId },
    user: { id: userId },
    member,
    isButton: () => true,
    isChatInputCommand: () => false,
    isDeferred: false,
    isReplied: false,
    async deferUpdate() { calls.defers.push('update'); this.isDeferred = true; },
    async deferReply() { calls.defers.push('reply'); this.isDeferred = true; },
    async reply(payload) { calls.replies.push(payload); this.isReplied = true; },
    async editReply(payload) { calls.edits.push(payload); },
    async followUp(payload) { calls.follows.push(payload); },
  };
}

export function createChatInputInteraction({
  commandName = 'test',
  guildId = 'guild-1',
  userId = 'user-1',
  member = createMember(),
  options = {},
  channel = { id: 'text-1', send: async () => {} },
} = {}) {
  return {
    commandName,
    guildId,
    user: { id: userId, username: 'test-user' },
    member,
    channel,
    guild: { members: { me: { voice: { channelId: member.voice.channelId } } } },
    options: {
      getString: key => options[key] ?? null,
      getInteger: key => options[key] ?? null,
      getBoolean: key => options[key] ?? null,
      getSubcommand: () => options.subcommand ?? null,
    },
    isChatInputCommand: () => true,
    isButton: () => false,
    isDeferred: false,
    isReplied: false,
    async deferReply() { this.isDeferred = true; },
    async reply(payload) { this.replyPayload = payload; this.isReplied = true; },
    async editReply(payload) { this.replyPayload = payload; },
  };
}
```

- [ ] **Step 2: Run syntax verification for the helper**

Run:

```bash
node --check test/helpers/discord-interaction.js
```

Expected: exit code 0.

- [ ] **Step 3: Update the test subtree contract**

Add `test/helpers/` and the new interaction fixture responsibilities to `test/AGENTS.md` without changing the existing hermetic-test rule.

---

### Task 2: Reproduce the `/playnext` failure

**Files:**
- Create: `test/commands-playnext.test.js`
- Read: `src/commands/playnext.js`, `src/music/player.js`, `src/utils/tracks.js`
- Modify: no production files

**Interfaces:**
- Consumes: the existing `playnext` command and real `MusicPlayer` with a fake Shoukaku/Lavalink boundary.
- Produces: a failing regression that proves an idle `/playnext` does not enqueue or start the requested track.

- [ ] **Step 1: Write the failing test**

The test must:

1. Build a real `MusicPlayer` with a fake Shoukaku whose node resolves a literal track.
2. Build a real `playnext` command execution with a voice channel and no existing player.
3. Invoke `execute`.
4. Assert the real player state contains the resolved track, the fake Lavalink player received `playTrack`, and the command reports that playback started.
5. Name the break in the test description: `playnext passes a context object where enqueueFront expects a guild id`.

Use the existing `track()` shape from `test/music-player.test.js` as the fixture, with literal expected title `Track next`.

- [ ] **Step 2: Run the targeted test to verify RED**

Run:

```bash
node --test test/commands-playnext.test.js
```

Expected: FAIL because the current command calls `enqueueFront({ guildId, track, ... })`, leaving the real guild queue empty and producing no Lavalink playback.

- [ ] **Step 3: Do not change production code**

Keep the test failing as the Phase 0 reproduction. Do not adjust the assertion to match the broken implementation.

---

### Task 3: Reproduce the `/forcefix` failure

**Files:**
- Create: `test/commands-forcefix.test.js`
- Read: `src/commands/forcefix.js`, `src/music/player.js`
- Modify: no production files

**Interfaces:**
- Consumes: the real `forcefix` command and `MusicPlayer` with a fake Shoukaku/Lavalink boundary.
- Produces: a failing regression that proves queue restoration does not reconnect or resume playback and does not preserve order.

- [ ] **Step 1: Write the failing test**

The test must create literal tracks `current`, `queued-1`, and `queued-2`, put them in a playing player, invoke `/forcefix`, and assert:

- the voice channel is joined again;
- the current track is played first;
- queued tracks remain in their original order;
- the final response is not a false success for a disconnected player.

Use the test name `forcefix reconnects and restores tracks in playback order`.

- [ ] **Step 2: Run the targeted test to verify RED**

Run:

```bash
node --test test/commands-forcefix.test.js
```

Expected: FAIL because the current command stops the player and unshifts tracks without joining or starting playback.

- [ ] **Step 3: Preserve the failure**

Do not change production files or weaken the assertions.

---

### Task 4: Reproduce broken component custom-ID routing

**Files:**
- Create: `test/interaction-routing.test.js`
- Read: `src/events/interactionCreate.js`, `src/commands/playlist.js`, `src/commands/liked.js`, `src/commands/clearliked.js`
- Modify: no production files

**Interfaces:**
- Consumes: the real `interactionCreate` event handler and real playlist/liked command modules.
- Produces: failing cases for playlist pagination, liked pagination, and clear-liked confirmation IDs.

- [ ] **Step 1: Add one failing test per custom-ID family**

Use real command modules and deterministic store fakes that return literal playlist/song data. Each test must assert the observable result after `execute`:

- playlist page two calls the playlist view path and updates the originating message;
- liked page two calls the liked view path and updates the originating message;
- clear-liked confirm clears only the owning user's songs and updates the message;
- a user ID embedded in another user's ID is rejected.

Use these exact current ID shapes as fixtures:

```text
auralyn:pl:page:user-1:Workout:2
auralyn:liked:page:user-1:2
auralyn:liked:clear:confirm:user-1
```

- [ ] **Step 2: Run the targeted test to verify RED**

Run:

```bash
node --test test/interaction-routing.test.js
```

Expected: FAIL because the handler interprets the third segment as `guildId` and rejects each family before its branch runs.

- [ ] **Step 3: Preserve the failure**

Do not add a parser or alter the handler in Phase 0.

---

### Task 5: Reproduce missing button authorization

**Files:**
- Create: `test/interaction-authorization.test.js`
- Read: `src/events/interactionCreate.js`, `src/utils/permissions.js`, `src/commands/settings.js`
- Modify: no production files

**Interfaces:**
- Consumes: the real interaction handler and real permission helpers.
- Produces: failing tests proving settings-reset and panel controls mutate state without a fresh permission check.

- [ ] **Step 1: Write the settings-reset failure test**

Build a real settings store double, a client with a real `MusicPlayer` surface, and a button interaction for `auralyn:settings-reset:guild-1` from a non-administrator member. Assert that the store is unchanged and the user receives a permission response.

- [ ] **Step 2: Write the panel-control failure test**

Build a real player with a fake Lavalink player and a button interaction for `auralyn:panel_skip:guild-1` from a member who is not in the bot's voice channel and lacks DJ/admin permission. Assert that the track is not skipped and the interaction receives a permission response.

- [ ] **Step 3: Run the targeted test to verify RED**

Run:

```bash
node --test test/interaction-authorization.test.js
```

Expected: FAIL because the current handler checks only the guild ID for these buttons.

- [ ] **Step 4: Preserve the failure**

Do not add authorization logic before the production phase that owns the policy.

---

### Task 6: Reproduce command-synchronization state leakage

**Files:**
- Create: `test/command-deployment-state.test.js`
- Read: `src/utils/deploy-commands.js`, `src/index.js`
- Modify: no production files

**Interfaces:**
- Consumes: a wished-for pure target-key contract for the deployment cache.
- Produces: a failing regression that models a global deployment followed by a different guild deployment.

- [ ] **Step 1: Write the failing contract test**

The test imports `shouldDeployForTarget` from `src/utils/deploy-commands.js` and asserts this contract:

```js
const state = { hash: 'same-hash', deployedTargets: new Set(['global:client-1']) };
assert.equal(
  shouldDeployForTarget(state, 'guild:client-1:guild-2', 'same-hash'),
  true,
);
```

The break being guarded is a command hash for one deployment target suppressing a different target.

- [ ] **Step 2: Run the targeted test to verify RED**

Run:

```bash
node --test test/command-deployment-state.test.js
```

Expected: FAIL because the target-aware deployment state function does not exist and the current module uses one process-wide hash.

- [ ] **Step 3: Preserve the failure**

Do not change deployment production code in Phase 0.

---

### Task 7: Reproduce the missing shard IPC contract

**Files:**
- Create: `test/shard-ipc.test.js`
- Read: `src/shard.js`, `src/index.js`
- Modify: no production files

**Interfaces:**
- Consumes: a wished-for pure handler contract in `src/utils/shard-ipc.js`.
- Produces: a failing regression proving the manager message currently has no child-side handler.

- [ ] **Step 1: Write the failing contract test**

The test imports `handleShardMessage` and invokes it with:

```js
const calls = [];
const result = handleShardMessage({ op: 'graceful_shutdown' }, () => calls.push('shutdown'));
assert.equal(result, true);
assert.deepEqual(calls, ['shutdown']);
```

Also assert that an unrelated message returns `false` and does not call shutdown.

- [ ] **Step 2: Run the targeted test to verify RED**

Run:

```bash
node --test test/shard-ipc.test.js
```

Expected: FAIL because `src/utils/shard-ipc.js` and `handleShardMessage` do not exist, while the manager currently sends the message at `src/shard.js:117`.

- [ ] **Step 3: Preserve the failure**

Do not add the IPC module before the production phase that owns shutdown behavior.

---

### Task 8: Record the complete Phase 0 RED set

**Files:**
- Modify: none
- Read: all Phase 0 test files

**Interfaces:**
- Consumes: the five new regression test files and the untouched baseline.
- Produces: a complete, reproducible RED inventory for Phase 1 and subsequent phases.

- [ ] **Step 1: Run every new targeted test separately**

Run each command independently:

```bash
node --test test/commands-playnext.test.js
node --test test/commands-forcefix.test.js
node --test test/interaction-routing.test.js
node --test test/interaction-authorization.test.js
node --test test/command-deployment-state.test.js
node --test test/shard-ipc.test.js
```

Expected: each command fails for the documented behavioral reason, not because of a syntax error, missing fixture, or typo.

- [ ] **Step 2: Run the complete suite**

Run:

```bash
npm test
```

Expected: the pre-existing tests retain their baseline result, while the new regressions remain RED and are clearly identified.

- [ ] **Step 3: Check the test-only diff**

Run:

```bash
git diff --check
git diff --stat
```

Expected: only test files, the test helper, and the test AGENTS contract changed. No `src/`, Docker, Lavalink, or deployment file may appear in the diff.

- [ ] **Step 4: Capture the Phase 0 handoff**

Report:

- baseline command/test counts;
- each targeted test and its expected failure message;
- the untouched production-file list;
- the first production file and test that Phase 1 will modify.

Phase 0 is complete at this point even though the new regression suite is intentionally red. No production fix is permitted in this phase.
