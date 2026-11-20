# Claude Code – Agent-Specific Notes

> Read `AGENTS.md` first. It is the project's source of truth; this file is
> strictly additive and must not contradict or duplicate it.

## Orchestrated sessions

When `spec` launches a non-interactive Claude session, the execution backend,
generated settings, and launch arguments define its permissions. Do not try to
loosen or work around those controls from inside the session. If a required
host tool or credential is unavailable, report `needs-input` or `blocked` as
described in `AGENTS.md`.

Never extract a user's GitHub token into shell commands or replace `gh` with a
hand-written authenticated `curl` request. Forge publication and merge remain
host-orchestrator responsibilities during an implementation run.

## Local settings

- `.claude/settings.json` contains project-level settings and may be committed.
- `.claude/settings.local.json` contains personal overrides and should remain
  gitignored.

## Tool preferences

- Use **Edit** (string replacement) for modifying existing files; avoid sed/awk
- Use **Glob** and **Grep** for file/content search; avoid shell find/grep
- Use **Agent** with `subagent_type=Explore` for broad codebase exploration
- Use **Read** to view files; avoid cat/head/tail

## Memory

Claude Code stores project memory in `~/.claude/projects/…/memory/`. Consult memory
files at the start of each session to build on previous experience.

## GitHub CLI (`gh`) in interactive sessions

The Claude Code sandbox proxy breaks `gh`'s TLS verification. In an interactive
session, run `gh` with the sandbox disabled rather than substituting a
token-bearing `curl` request. `git push` works fine through the proxy. Inside an
orchestrated `spec` run, publication stays with the orchestrator (see above).
