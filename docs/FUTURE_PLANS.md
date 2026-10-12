# Future plans

Ideas the product owner wants to keep for later releases. They are **not** part
of the agreed implementation plan until they are moved into
`IMPLEMENTATION_PLAN.md` with acceptance criteria and a decision record.

## Player market with moderator discounts

- **Requested by:** Peter, 2026-10-12.
- **Idea:** Add a market where players can buy items with the event currency
  (points or lives, depending on the scoring mode). Moderators (event
  administrators) can apply discounts to market items.
- **Open questions before design:**
  - Who buys: the whole team (shared balance) or individual players? Players are
    anonymous today, so a team-level wallet fits the current model; individual
    purchases would require player accounts, which §19 lists as out of scope.
  - Does spending reduce the standings total, or is there a separate spendable
    balance? Spending standings points changes rankings and must be audited like
    adjustments.
  - Discount scope: per item, per team or time-boxed, and whether discounts stack.
  - Stock limits, refunds/cancellation, and who confirms delivery of a purchased
    item on the event floor.
  - Lives mode: whether lives can be bought, and a cap on purchased lives.
- **Constraints to respect:** every purchase/discount is a server RPC with a
  permission check, validation, audit and idempotent `p_op_id` (§3.1); hidden
  leaderboard rules (D005/D027) must not leak other teams' balances.
