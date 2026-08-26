# YnabCategoryAi

A .NET 8 console app that categorizes YNAB transactions using a tiered pipeline: deterministic lookups, hierarchical ML (group → category), and optional LLM fallback for ambiguous merchants and novel cases.

## Pipeline tiers

| Tier | Method | When used |
|------|--------|-----------|
| 1 | Import + amount lookup | Exact repeat purchase (high vote share) |
| 2 | Import string lookup | Same bank import string seen before |
| 3 | Payee ID lookup | Single-category payees only, or ≥95% vote share |
| 4 | Hierarchical ML | Group model + category model (must agree) |
| 5 | Payee resolution + canonical lookup | Import → payee name mapping |
| 6 | Flat category ML | Remaining cases with enough training data |
| 7 | LLM (`--llm`) | Novel imports, low confidence (non-excluded only) |
| 8 | **Excluded** | Amazon/Walmart/checks — skipped entirely, manual only |
| 9 | Manual review | No confident prediction |

**Excluded payees** (Amazon, Walmart, Safeway, etc.) and **checks** are never auto-classified. They are omitted from precision/coverage metrics during `evaluate`.

**Untrained categories** (in YNAB but never classified in your history) are never auto-applied by local ML; LLM may suggest them but flags for review.

**Placeholder categories** (`Uncategorized`, `Inflow:*`, Internal Master Category) are never training labels or suggestions. Pending rows still contribute to periodic cadence detection; those names do not vote as a series category.

## Approval workflow (API-ready)

`PredictDetailedAsync` returns a **`CategorizationProposal`** with everything a review UI needs:

| Field | Purpose |
|-------|---------|
| `Tier` | `AutoApply`, `Suggested`, `Review`, `Blocked` |
| `SuggestedCategory` / `SuggestedCategoryId` | Primary suggestion (populated for AutoApply + Suggested) |
| `Options` | Ranked category choices (1 = top) with per-option confidence |
| `ConfidenceInterval` | Top/second/third confidence and spread between options |
| `Signals` | All method predictions with confidence |
| `AgreeingSignals` | Methods that agree on the suggestion |
| `Alternatives` | Ranked category options for pickers |
| `GapReason` | Why it didn't auto-apply |
| `Flags` | `IsAmbiguous`, `IsNovelImport`, etc. |

```bash
dotnet run predict              # human-readable tier summary
dotnet run predict-json                # JSON payload for API/UI integration
dotnet run predict-json --limit 50     # newest 50 pending
dotnet run predict-json --ids id,id    # specific transactions (API cache fill)
dotnet run serve                       # warm HTTP scorer on port 4021 (POST /predict)
dotnet run feedback-stats       # approval/denial metrics
```

### User feedback and retraining

`CategorizationFeedbackService.RecordAsync` stores approve / reject / change actions with a full proposal snapshot.

**Retraining does not need a separate feedback pipeline.** `dotnet run train` already loads approved, categorized transactions from the database (`TransactionQueries.GetTrainingTransactions`). Once your UI applies a category and YNAB sync writes it back, the next train picks it up automatically.

The feedback table is still valuable for:

- Audit trail (what the AI suggested vs what you chose)
- Measuring acceptance rate over time (`feedback-stats`)
- Future weighted training (e.g. up-weight recent corrections)

Rejections without a chosen category are **not** training examples until you categorize the transaction.

Create the feedback table (once) via the SQL in `apps/transactions-retrieval/src/data/scaffold.sql`.

## Commands

```bash
dotnet run                              # evaluate, train, predict (LLM off)
dotnet run predict --llm                # predict with LLM for hard cases
dotnet run train [--force]
dotnet run evaluate                     # held-out eval, LLM off
dotnet run export
```

## Configuration

Committed `appsettings.json` holds ML thresholds and exclusions only. Database credentials and API keys go in gitignored `appsettings.Local.json` (copy from `appsettings.Local.json.example`) or environment variables. `DB_CONNECTION_STRING` wins over the JSON connection string so the API can inject it.

### Warm HTTP scorer

For on-the-fly classify scoring, run the warm scorer so the API does not spawn a new process per predict window:

```bash
# Terminal 1 — loads models once, listens on :4021
dotnet run serve

# Terminal 2 — API uses HTTP scorer when CATEGORIZATION_SCORER_URL is set
CATEGORIZATION_SCORER_URL=http://localhost:4021 pnpm --filter @budget-tools/api dev
```

Or from the repo root: `pnpm dev` starts API, web, and scorer together when `.env.local` includes `CATEGORIZATION_SCORER_URL`.

Endpoints:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Ready check + model signature |
| `POST` | `/predict` | Body `{ "transactionIds": ["id"], "llm": false }` → same envelope as `predict-json` |
| `POST` | `/reload` | Rebuild lookups/models after `dotnet run train` |

`appsettings.json`:

| Section | Key | Description |
|---------|-----|-------------|
| `ML` | `ConfidenceThreshold` | Min confidence for reliable auto-categorization (default 0.85) |
| `ML` | `MinCategoryTrainingExamples` | Categories below this count use LLM/manual (default 5) |
| `ClassificationExclusions` | `PayeePatterns` | Payees never auto-classified (Amazon, Walmart, …) |
| `ClassificationExclusions` | `CheckPatterns` | Check-related patterns in payee/import/memo |
| `Llm` | `Enabled`, `ApiKey`, `Model` | OpenAI-compatible API (`gpt-4.1-nano` default) |

Set `OPENAI_API_KEY` or `Llm:ApiKey` in gitignored `appsettings.Local.json`.

## Project structure

```
Data/CategoryCatalog.cs           All YNAB categories + training coverage
ML/GroupClassificationModel.cs  Category group predictor
ML/HierarchicalClassificationModel.cs  Group → category validation
ML/ClassificationExclusionMatcher.cs  Skip Amazon/Walmart/checks
ML/Llm/OpenAiCategorizationService.cs  Constrained LLM categorization
ML/CategorizationPipeline.cs      Orchestrates all tiers
```

## Models

Saved to `models/` (gitignored):

- `group-model.zip` — category group classifier
- `category-model.zip` — category classifier
- `payee-model.zip` — import string → canonical payee

Delete or use `--force` to retrain.
