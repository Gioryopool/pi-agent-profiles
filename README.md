# @gioryopool/pi-agent-profiles

Named, session-scoped routing profiles for Pi, with a self-contained runtime for running markdown-defined subagents in the foreground or background.

> **Security:** Pi extensions execute with full system access. Install only code you trust, and review project configuration before trusting a project.

## Install

Install the latest published release from npm:

```bash
pi install npm:@gioryopool/pi-agent-profiles
```

Use GitHub only to try the current unreleased code:

```bash
pi install git:github.com/Gioryopool/pi-agent-profiles
```

Restart Pi or run `/reload` after installation or configuration changes.

## Quick start

Create `<getAgentDir()>/pi-agent-profiles/config.json`:

```json
{
  "version": 1,
  "defaultProfile": "review",
  "profiles": {
    "review": {
      "order": 10,
      "orchestrator": { "effort": "high" },
      "agents": {}
    }
  }
}
```

Reload Pi, then open `/agent-profiles` or activate the profile directly:

```text
/agent-profiles use review
```

Trusted projects may add project-scoped profiles. Project configuration is never read or written unless Pi reports that project as trusted.

## What it provides

- Named profiles that route the parent model/effort and per-agent model/effort independently.
- A consolidated keyboard-driven panel for creating, editing, saving, activating, cycling, and deleting profiles.
- Markdown-defined subagents with exact-session foreground/background execution, live messaging, cancellation, handoff, and continuation.
- A session-isolated history panel, active-task widget, bounded completion cards, and package-owned SQLite history.
- Safe route rollback and restoration of active/off state when a Pi session is rebound.
- Optional synchronous compatibility events for external runtimes, without making them a dependency.

## Controls

### Agent profiles

| Control | Action |
| --- | --- |
| `/agent-profiles` | Open the profile assignment panel. |
| `ctrl+tab` | Cycle through configured profiles. |
| `Tab` / `Shift+Tab` | Move between profile tabs and `+ new`. |
| `Up` / `Down` / `j` / `k` | Move through assignments. |
| `Enter` / `M` / `E` | Edit the selected model or effort. |
| `S` / `A` | Save, or save and activate the profile. |
| `N` / `R` / `Del` | Create, reset, or delete. |
| `Esc` / `q` | Return or close the panel. |

### Subagents

| Control | Action |
| --- | --- |
| `/subagents` / `ctrl+,` | Open execution history. |
| `Up` / `Down` / `Enter` | Select a task and open its details. |
| `ctrl+o` / `ctrl+t` | Toggle tool output or thinking. |
| `ctrl+h` | Hand foreground work to the background. |
| `x` | Cancel the selected queued or running task. |
| Double `Esc` | Cancel active work for the current parent session. |

See [Agent profiles and configuration](docs/agent-profiles.md) and [Subagent runtime](docs/subagent-runtime.md) for complete commands, configuration, and control behavior.

## Compatibility and limits

This beta package requires Node.js 22.19.0 or newer. Its subagent runtime is standalone: it has no Joker imports and does not read Joker history or storage. Only one runtime can own Pi's canonical `subagent_*` tool names. If a compatible Joker runtime is detected first, this extension registers `agent_profiles_subagent_*` aliases; if this extension loads first, a later runtime may be unable to register its canonical tools.

Model-visible task results are capped at 16,000 characters. History, messaging, continuation, shortcut, trust, and session-ownership limits are documented in [Subagent runtime](docs/subagent-runtime.md).

## Acknowledgements

This project owes meaningful inspiration to [**pi-subagents-j0k3r**](https://github.com/j0k3r-dev-rgl/pi-subagents-j0k3r) by [j0k3r](https://github.com/j0k3r-dev-rgl). Runtime and presentation behavior was independently adapted from that project under the MIT License. Thank you to j0k3r for making that work available.

This package remains self-contained and uses its own naming, storage, and runtime implementation; it does not import, bundle, claim ownership of, or provide support for Joker. See [Third-party notices](THIRD_PARTY_NOTICES.md) for the exact provenance and complete MIT notice.

## Documentation

- [Agent profiles and configuration](docs/agent-profiles.md)
- [Subagent runtime](docs/subagent-runtime.md)
- [Session routing compatibility contract](docs/session-routing-contract.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [MIT license](LICENSE)
