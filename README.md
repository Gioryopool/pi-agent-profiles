# @gioryopool/pi-agent-profiles

`@gioryopool/pi-agent-profiles` is a beta, independently implemented Pi extension for named, session-scoped agent-routing profiles and a self-contained subagent runtime.

> **Security warning:** Pi extensions execute with full system access. Install only code you trust, and review project configuration before trusting a project.

## Install

Install the latest published release from npm with Pi:

```bash
pi install npm:@gioryopool/pi-agent-profiles
```

To try the current unreleased version from GitHub:

```bash
pi install git:github.com/Gioryopool/pi-agent-profiles
```

Restart or `/reload` Pi after installing the extension or changing its configuration.

### Local development install

From a checkout, use Pi's local-source install flow:

```bash
pi install /absolute/path/to/pi-agent-profiles
```

Keep the checkout available while Pi loads the extension.

## Compatibility

The subagent runtime is standalone and has no Joker dependency. It can coexist with a compatible Joker runtime, but only one runtime can own the canonical `subagent_*` tool names: when Joker is already detected, this extension uses `agent_profiles_subagent_*` aliases. If this extension loads first, a later Joker load may not register its canonical tools.

## Quick path

1. Create global configuration at `<getAgentDir()>/pi-agent-profiles/config.json`.
2. Add one or more profiles using the schema below.
3. Restart or `/reload` Pi, then run `/agent-profiles use <name>`.

## Configuration, scope, and trust

Global configuration is stored at `<getAgentDir()>/pi-agent-profiles/config.json`. A trusted project may add configuration at `<cwd>/<CONFIG_DIR_NAME>/pi-agent-profiles/config.json`.

Project configuration is never read or written unless Pi reports the project as trusted. Effective configuration merges global and trusted-project profiles; a same-name project profile replaces the complete global profile. `shortcut` always comes from global configuration, so a project cannot override it.

### Full schema

```json
{
  "version": 1,
  "shortcut": "ctrl+tab",
  "defaultProfile": "review work",
  "cycle": ["review work", "fast"],
  "profiles": {
    "review work": {
      "order": 10,
      "orchestrator": {
        "model": { "provider": "anthropic", "id": "claude-sonnet" },
        "effort": "medium"
      },
      "defaultRoute": {
        "model": null,
        "effort": "inherit"
      },
      "agents": {
        "researcher": {
          "model": { "provider": "openai", "id": "gpt-4.1" },
          "effort": "high"
        }
      }
    }
  }
}
```

| Field | Meaning |
| --- | --- |
| `version` | Required schema version; currently `1`. |
| `shortcut` | Optional global shortcut. Defaults to `ctrl+tab`; it is registered synchronously at extension creation. |
| `defaultProfile` | Optional profile name activated when a session has no stored profile marker. |
| `cycle` | Optional, unique list of existing profile names used by `next` and the shortcut. |
| `profiles` | Required map of arbitrary profile names to profile definitions. |
| `order` | Internal integer used to order profiles when no `cycle` is set. The panel assigns a new draft after the highest existing order. It controls `/agent-profiles next` and shortcut cycling only. |
| `orchestrator` | Optional parent Pi route applied while the profile is active. |
| `defaultRoute` | Optional route for agents without an explicit override. |
| `agents` | Optional map of arbitrary agent names to route overrides. Agent keys are normalized to lowercase. |

A route may contain `model` and/or `effort`. A model is `{ "provider": "…", "id": "…" }`. Valid efforts are `inherit`, `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`.

`model: null` and `effort: "inherit"` are persisted suppression sentinels: they inherit the consumer/runtime value and can suppress a default route in an agent override. They are configuration-only and are never sent on an event or stored in an active route snapshot.

## Commands and shortcut

`/agent-profiles` opens the consolidated assignment panel. Top tabs follow profile manager order; `Tab` and `Shift+Tab` wrap through profiles and the final `+ new` tab. Tabs show `G`/`P` scope, `*` active, and `•` unsaved-draft markers. `/agent-profiles create` opens directly in the inline profile-name editor; `/agent-profiles edit <name>` focuses that profile.

| Key | Action |
| --- | --- |
| `↑`/`↓`/`j`/`k` | Move between selectable assignments (group headings are skipped). |
| `Enter` / `M` / `E` | Open the selected assignment's model picker / model picker / effort picker. Model and effort are independent. |
| `R` | Reset the selected assignment; on a bulk row, remove that group's overrides. |
| `S` / `A` | Save the current profile / save then activate it. |
| `N`, `+ new` + `Enter`, `Del`, `Esc`/`q` | Create a draft / delete / close the assignment view. |

The rounded overlay uses a compact assignment list: `label  model=<effective value>, effort=<effective value>`. It lists Orchestrator, Default agents, and grouped `sdd-*`, `jd-*`, `review-*`, and Other agents without a padded three-column table. Each nonempty group has a `Set all …` row: `Enter` or `M` opens its model picker, while `E` opens its effort picker; either applies only that field across the group. Model and effort pickers replace the assignment body inside the same overlay; both support `↑`/`↓`/`j`/`k` navigation, and `Esc` returns to the list. In the assignment view, `Esc` or `q` closes the panel. `Del` means the forward Delete key (`Suprimir` on Spanish keyboards), not Backspace; Backspace is only for editing inline text.

New profiles are fully inline in that same overlay: `+ new` opens a name editor, then a scope screen, with `Esc` returning from scope to name and from name to `+ new`. Empty or duplicate names are shown as inline errors. Global scope is always available; Project scope is offered only when Pi reports the current project as trusted. Confirming creates a dirty in-memory draft without writing storage. `S` writes only the selected draft; `A` writes a dirty draft before activation. Closing with any dirty draft asks whether to discard it. Deleting an unsaved draft is in-memory only; deleting a saved profile asks for confirmation before storage is changed. Textual fallback commands remain available: `list`, `status`, `use <name>`, `next`, and `off`. `delete <name>` also remains available for direct removal.

A save updates in-memory effective configuration only after durable storage succeeds. The global shortcut cycles profiles; it defaults to `ctrl+tab`. Invalid global shortcuts fall back to that default and are reported at `session_start`; changing a shortcut requires restart or `/reload`. During this pre-release migration, an existing persisted `ctrl+alt+p` value (the previous generated default) resolves to `ctrl+tab` on `/reload` and is written as `ctrl+tab` on the next durable profile save. Other explicit shortcut values are preserved. The internal `order` field controls `/agent-profiles next` and shortcut cycling only when `cycle` is not configured.

## Self-contained subagent runtime

The package provides a neutral, self-contained runtime without Joker. `/subagents` opens a full-width, parent-session-isolated execution history panel; `ctrl+,` opens the same panel globally. Its horizontal execution strip follows the focused task while the remaining terminal height is a tail-following detail view with arrow/page/Home/End and mouse-wheel scrolling. The header shows public agent/status/attempt/mode/model/effort/ID/duration/usage/context/activity and configured timeout/stall hints; structured task/activity/thread rows always retain the final response. `ctrl+o` toggles tool output, `ctrl+t` toggles thinking, and `x` (or compatible `detail_cancel_shortcut`) cancels only the selected queued/running task. Opening the overlay enables terminal mouse tracking and closing or disposing it restores terminal mode. Project history shortcut overrides are intentionally not applied because Pi registers global shortcuts at construction time; `ctrl+,` remains the effective documented chord. The panel reads a bounded, sanitized internal timeline through an exact-session manager method and never renders agent definitions, instructions, nested-session paths, or other private runtime fields. Markdown-defined agents can be listed and run with `subagent_list_agents`, `subagent_run`, `subagent_status`, `subagent_result`, `subagent_list_tasks`, `subagent_cancel`, `subagent_send_message`, and `subagent_continue`. When another compatible runtime already owns canonical names, exactly one namespaced `agent_profiles_subagent_*` set is registered instead.

Tasks use foreground (`task`) or background mode. Each selected agent resolves its mode independently: invocation `mode` overrides every member; otherwise its definition mode then compatible `subagents.json` `default_mode` applies. A mixed multi-agent run waits only for task-mode members and returns background member IDs immediately. Tool calls and results use compact colored cards rather than raw JSON: task responses/errors are collapsed by default and `ctrl+o` expands them. The cards show only public task summaries (agent, status, attempt, mode, model, effort, usage, and ID); foreground tool content still carries the bounded actual result or error for the model. As an intentional package safety difference, model-visible task text is capped at 16,000 characters; expanded cards can show only that retained bounded text. This boundary is preserved rather than importing Joker's fuller result behavior. Background launch returns immediately. While exact-session background work is queued or running, a below-editor widget lists `○ main` and each task's status/current activity; Down/Up navigate it, Enter on a task opens `/subagents` focused on that task, and Enter on main returns editor input. It is removed when no active work remains and does not capture input while the history panel is open. Terminal background completion sends exactly one Pi follow-up with a profiles-owned colored card: its model-visible content contains the bounded final response once, while the card is collapsed by default and expands with `ctrl+o`. The card details exclude definitions, paths, parent-session identifiers, and raw runtime state. The runtime reads existing markdown and `subagents.json` configuration only; it writes its own SQLite history at `<getAgentDir()>/pi-agent-profiles/runtime/history.sqlite`, never reads or imports old Joker history. History is parent-session isolated and retained on disk only up to the configured `history_limit` newest rows per parent session; stale in-progress work is marked interrupted after restart.

Live messages are limited to the exact owning parent session and an active task. They require Pi nested-session steering support; messages are bounded and may be queued until that bridge is ready. Running cards show a bounded, content-free completed trail plus one explicit current activity, and refresh approximately every 500ms. `ctrl+h` hands the exact session's foreground work to background mode without aborting its nested session; set compatible global `subagents.json` `background_handoff_shortcut` to a supported shortcut and reload to change it. Trusted-project overrides must be `ctrl+` plus one letter. Pi registers the construction-time global chord; a trusted project Ctrl+letter override is matched by Pi's supported session-scoped terminal-input subscription only for its active foreground session, so the displayed hint remains effective and the registered global default does not hand off overridden work. A double Escape delivered through that Pi subscription for the exact parent session cancels that session's active work, never another session's work. Continuation requires a terminal task with a valid package-owned nested-session file and Pi `SessionManager.open`; it creates a new attempt in the same task lineage. `subagent_continue` accepts optional `mode: task|background`, resolving explicit mode, then the prior effective mode, then `default_mode`; background continuation returns its task ID immediately and sends one terminal follow-up. The continue tool remains registered for a stable eight-tool catalog, but execution is rejected when compatible `subagents.json` has `enable_continue: false`. As an intentional package difference from Joker, continuation is enabled by default when the field is absent; only an explicit global or project `false` disables it. Unsupported, unsafe, or missing session files return a clear error.

The `pi-subagents:model-route:v1` listener remains an optional compatibility adapter for externally loaded Joker. A neutral `pi-subagents:agents:v1` catalog event is always emitted once, synchronously, at construction as a coexistence probe. Catalog data from that event is used only when internal discovery is unavailable. These event contracts remain synchronous; repeated or late replies are ignored or diagnosed. Pi keeps the first registration per tool name. When the construction probe detects a preloaded Joker responder, this extension registers only `agent_profiles_subagent_*` aliases; otherwise it registers canonical `subagent_*` names. If this extension loads first, a later Joker load may have its canonical registrations ignored. Pi has no public tool-definition lookup, so a responder probe cannot detect a later load.

The history panel structure and input conventions, background-widget behavior, and completion-card presentation were independently adapted under MIT from the referenced `pi-subagents-j0k3r` implementation, with package-owned storage and no Joker imports, branding, or storage. Adapted behavior provenance and the complete MIT notice for `pi-subagents-j0k3r` are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). This package does not claim ownership of or support for Joker.

Catalog agents require nonempty `name`, `description`, and `scope` strings. Names are normalized to lowercase and duplicates are rejected case-insensitively. Event routes never include the persistence sentinels (`null` model or `inherit` effort).

## Session behavior and rollback

Activating a profile captures the first pre-profile model/effort baseline for that session. Each switch applies the selected parent route and restores omitted, `null`, or `inherit` fields from that baseline. If a switch fails, the previous active parent route and snapshot are restored. If `off` cannot restore the baseline, the profile remains active.

The extension persists active and off markers through `appendEntry("pi-agent-profiles:active", snapshot)`. On the next session start, a rebound extension restores the latest valid marker. On final shutdown, after all live parent sessions have closed, it releases its event listener and clears its in-memory state.
