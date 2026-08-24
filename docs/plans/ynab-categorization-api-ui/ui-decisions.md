# Implementation plan: Classification UI (session-only)

Maps to [PRD §6.4](./PRD.md#64-ui--review-application) decision actions, without the write path.

## Goal

A reviewer can move through scored transactions one at a time, accept the suggestion, reject it, or pick a different category — from the keyboard. When complete:

- The review page is a labeling bench (current item + queue rail), not a card list
- **Certain** means rounded 100% confidence and a suggested category; those items are marked in the rail and can be accepted as a batch
- Decisions exist only in the current browser session (no `POST /decisions`, no YNAB writes)
- `pnpm check` still passes

## Out of scope

- Persist feedback or outbound sync (`api-write-path.md`)
- Payee / memo editing, `markApprovedInYnab`
- Flush controls and sync badges

## Design

**One item in focus.** The queue rail lists every visible scored transaction. The stage shows payee, amount, suggestion, numbered option keys, catalog search, Accept, and Reject.

**Keyboard.** `A` / `Enter` accept suggestion · `R` reject · `1–8` ranked options · `J`/`K` next/previous undecided · `⇧A` accept all certain · `⌘Z` undo. Bindings are ignored while typing in the category search.

**Certain.** `Math.round(confidence * 100) === 100` and `suggestedCategory` is set. Same rounding as the `100%` label.

**Session state.** Accept / reject / change records stay in memory, keyed by `generatedAt` (remount on a new predict run). Undo is a stack. Nothing is written to the API.

**Catalog.** `GET /api/categories` feeds the searchable picker. Ranked `proposal.options` are the fast path; the catalog is for everything else.
