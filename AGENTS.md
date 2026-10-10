# Repository collaboration rules

Before making changes, read `docs/IMPLEMENTATION_PLAN.md`, `docs/DECISIONS.md`, `docs/PHASE_0_RESULTS.md`, `docs/COORDINATION.md`, and the latest entry in `docs/PROGRESS_LOG.md`.

For every work session:

1. Inspect `git status` and the current branch before editing. Do not overwrite another contributor's uncommitted changes. If work is already in progress, coordinate through the shared branch and progress log.
2. Keep the coordination documents current as part of the work, not as an optional final note. Record the intended task in `docs/PROGRESS_LOG.md` before substantial edits; update it at meaningful milestones and before handing work off or ending a session. Record changed areas, decisions, checks and outcomes, blockers, and the next concrete step. Update `docs/DECISIONS.md` for durable decisions and `docs/COORDINATION.md` or this file if the collaboration process changes.
3. Use `docs/DECISIONS.md` for durable design choices or deviations; use `docs/PROGRESS_LOG.md` for chronological work history. Keep the implementation plan as the source of truth for product requirements.
4. Never put passwords, tokens, service-role keys, personal credentials, or other secrets in repository documentation. Describe secret names and where they are configured, not their values.
5. Before starting work on another device, fetch/pull the shared branch and read the latest progress entry. Before pushing, inspect the diff and coordinate if another contributor has changed the same files.
6. Keep progress entries concise and factual. Distinguish passed checks from checks that were not run or were blocked by unavailable services.

These instructions apply to the primary agent and any delegated agents. The primary agent is responsible for making sure delegated work is reflected in the shared log before handoff.

## Git workflow

- After completing a task, run the relevant tests and lint/format checks, then commit the finished work.
- Use Conventional Commit prefixes: `feat:`, `fix:`, `refactor:`, or `chore:`.
- Keep one logical change per commit.
- Never push or amend existing commits unless the user asks. If the user asks to publish a branch, inspect the diff and branch state first, then push that branch without rewriting existing history.
