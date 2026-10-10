# Cross-device collaboration

This repository is the shared handoff record for work by Gendy and collaborating agents across devices. The git branch and committed repository files are the durable shared state; chat history on one device is not.

## Starting a work session

1. Fetch and pull the branch you intend to continue.
2. Read `AGENTS.md`, the agreed plan, `DECISIONS.md`, `PHASE_0_RESULTS.md`, and the newest entry in `PROGRESS_LOG.md`.
3. Check `git status` and confirm which files are already modified. Do not reset, replace, or reformat another person's uncommitted work.
4. Add a short `STARTED` entry to `PROGRESS_LOG.md` stating the goal, branch, and files or area you expect to touch. If another person is active on the same work, coordinate ownership before editing overlapping files.

## Recording progress and handing off

- Update the same work entry at meaningful milestones with files changed, decisions, validations and exact outcomes, and anything blocked.
- Treat documentation as part of implementation: agents update the shared log and applicable decision/process docs whenever changes, findings, or next steps make them stale. The primary agent checks that delegated work is captured before handing it off.
- Before ending or handing off, mark the entry `HANDOFF` or `DONE` and write the next concrete action. Include the branch and whether the changes are committed/pushed so another device knows if it can fetch them.
- Keep `DECISIONS.md` for durable decisions and `PHASE_0_RESULTS.md` for Phase 0 acceptance. Do not use the chronological progress log to silently change acceptance status.
- Do not record secret values. Note required environment-variable names or configuration locations only.
- When a check fails, capture the failure and whether it indicates a product defect, baseline issue, or environment blocker. Do not describe an unrun check as passed.

## Reusable prompt for another device

After pulling the shared branch, the human can send the following prompt to their agent:

> Read `AGENTS.md`, `docs/COORDINATION.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/DECISIONS.md`, `docs/PHASE_0_RESULTS.md`, and the latest entry in `docs/PROGRESS_LOG.md` before changing anything. Check the current branch and `git status`; preserve all existing changes. Summarize what is done, what checks passed or are blocked, and the next task from the progress log. Continue within that scope without duplicating completed work. Keep `docs/PROGRESS_LOG.md` current at meaningful milestones and before handoff; update `docs/DECISIONS.md` when a durable decision or deviation is made, and update the coordination instructions if the collaboration process changes. Never record secrets. Before ending, state whether changes are committed and pushed and give the next concrete step.

## Current task ownership

Before parallel work, note the owner and scope in the progress entry. Prefer separate files or clearly separated scopes. If two contributors are editing the same files, one should pause or the pair should agree on a single integration owner. Review the latest shared progress entry before repeating a check or implementing a feature that may already be underway.
