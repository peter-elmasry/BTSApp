# Implementation decisions



## D066 — Owners identify the loaded frontend release from build metadata

Owners (including the seeded masry/gendui accounts) see a compact release row in
the account/More menu. Use the existing OWNER role, never a username allowlist;
other roles and guests do not render it. Display R<PR number>, short Git revision
and Production/Preview/Development with EN/AR labels and LTR identifiers.

The build derives the PR number from the repository's squash or merge commit
subject. Preview builds prefer their own Vercel PR ID and are explicitly labeled
Preview. Vercel's documented [system metadata](https://vercel.com/docs/environment-variables/system-environment-variables)
is preferred, with local Git/GitHub SHA fallback. A direct/rebase commit without a
PR subject displays its revision; missing identity displays Unavailable rather
than inventing a release number. Only validated identifiers and the environment
name enter the bundle, never raw commit messages or environment contents.

Generate through set-env before every npm production build/start/watch. No bot
commits, database counters, API credentials or runtime polling. This identifies
the frontend actually loaded, including an older offline/service-worker build;
fetching a server's newest version would falsely imply that old code had updated.
Production database/Edge deployment still needs its existing release checks.

CI builds use numbered preview-shaped metadata (the PR number, or fixture 1 on
push) to exercise a version that differs from its revision. Generated `as const`
strings are widened at the component boundary: comparing distinct literal types
otherwise raises TS2367 only for numbered builds. CI artifacts remain test builds;
Vercel deployments continue to use their real metadata.
