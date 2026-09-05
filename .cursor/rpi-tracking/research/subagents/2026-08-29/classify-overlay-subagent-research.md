<!-- markdownlint-disable-file -->

# Lane research: classify-overlay

| Field | Value |
|-------|-------|
| Date | 2026-08-29 |
| Cycle / wave | 1 / 1 (Wider) |
| Lane | classify-overlay |
| Posture | balanced |
| Scope | `apps/web/src` especially `components/review/classify`; API client; `App.tsx` routes |
| Non-goals | SQLite schema internals; OpenRouter internals; final architecture recommendation |
| Artifact path | `.cursor/rpi-tracking/research/subagents/2026-08-29/classify-overlay-subagent-research.md` |
| Parent primary (read-only) | `.cursor/rpi-tracking/research/2026-08-29/receipt-taking-research.md` |

## Lane inputs

- Parent topic: Classify overlay/prefetch; where a **cheap** receipt lookup inserts (must **not** call OCR/LLM on miss); Amazon overlay UI pattern; camera/upload existence; web→API wiring (HTTPS/phone); routing (inbox vs filmstrip).
- Questions: Q2 (applyLlmOverlay / needs* / prefetch insertion), Amazon card UI pattern, Q7 (camera/upload), API base URL / vite proxy / env, routing surfaces.
- PRD context (product intent only, not code evidence): `docs/prds/receipt-taking.md` §5.5 Classify step function — Amazon → amazon-suggest only; non-Amazon cheap receipt lookup before LLM; miss continues existing path.

## Actions taken

1. Globbed `apps/web/src/**/*classify*` and grepped overlay/prefetch symbols.
2. Read `applyLlmOverlay.ts`, `useLlmOverlay.ts`, `useAmazonSplitOverlay.ts`, `ClassifyWorkspace.tsx`, `ClassifyStage.tsx`, `ClassifyAmazonContext.tsx`.
3. Grepped `apps/web/src` for camera / `getUserMedia` / file input / upload / receipt / OCR — no hits.
4. Read `configureApiClient.ts`, `vite.config.ts`, `main.tsx`, `App.tsx`, `AppNav.tsx`, `ReviewQueuePage.tsx`, `ClassifyPage.tsx`, `QueueItemCard.tsx`.
5. Confirmed web-sdk Categorization endpoints for llm-suggest / amazon-suggest; no receipt symbols in `packages/web-sdk/src`.
6. Confirmed no `VITE_*` / `import.meta.env` usage under `apps/web/src`.

## Findings

### F1 — Overlay gate functions (Q2)

`needsLlmSuggest` returns false when decided, when there is no proposal, when the payee is Amazon, or when the local proposal is “certain” (100% confidence + category). Otherwise true → JIT LLM.

```9:24:apps/web/src/components/review/classify/applyLlmOverlay.ts
export function needsLlmSuggest(item: CategorizationQueueItemDto, decided: boolean): boolean {
    if (decided || !item.proposal) {
        return false;
    }
    if (isAmazonTransaction(item.transaction)) {
        return false;
    }
    return !isCertainProposal(item.proposal);
}

export function needsAmazonSuggest(item: CategorizationQueueItemDto, _decided = false): boolean {
    if (!item.proposal) {
        return false;
    }
    return isAmazonTransaction(item.transaction);
}
```

- Confidence: **high**
- Evidence: `apps/web/src/components/review/classify/applyLlmOverlay.ts:9-24`; Amazon skip also asserted in `apps/web/src/components/review/classify/__tests__/applyLlmOverlay.test.ts:27-32`

### F2 — Prefetch neighbor selection (Q2)

LLM and Amazon each select **one** previous and **one** next remaining neighbor matching their gate (`selectLlmPrefetchNeighbors` / `selectAmazonPrefetchNeighbors`). Neighbors are drawn from **remaining** (undecided) queue items, not the full loaded list.

```65:112:apps/web/src/components/review/classify/applyLlmOverlay.ts
export function selectLlmPrefetchNeighbors(
    remaining: readonly CategorizationQueueItemDto[],
    currentId: string | undefined,
): LlmPrefetchNeighbors {
    return {
        previous: previousUncertainRemaining(remaining, currentId),
        next: nextUncertainRemaining(remaining, currentId),
    };
}
// ...
export function selectAmazonPrefetchNeighbors(
    remaining: readonly CategorizationQueueItemDto[],
    currentId: string | undefined,
): LlmPrefetchNeighbors {
    return {
        previous: previousAmazonRemaining(remaining, currentId),
        next: nextAmazonRemaining(remaining, currentId),
    };
}
```

- Confidence: **high**
- Evidence: `applyLlmOverlay.ts:29-112`; wiring at `ClassifyWorkspace.tsx:58-73`

### F3 — Hook orchestration and exact insertion locus (Q2)

`ClassifyWorkspace` is the orchestrator: session → remaining → LLM prefetch + `useLlmOverlay` → Amazon prefetch + `useAmazonSplitOverlay` → `displayItem = overlay.item ?? current` → stage props.

```58:75:apps/web/src/components/review/classify/ClassifyWorkspace.tsx
    const remaining = remainingItems(items, classify.session);
    const predict = usePredictWindow({ currentId: current?.transaction.id, items });
    const llmPrefetch = selectLlmPrefetchNeighbors(remaining, current?.transaction.id);
    const overlay = useLlmOverlay({
        current,
        currentDecided,
        prefetchPrevious: llmPrefetch.previous,
        prefetchNext: llmPrefetch.next,
    });
    const amazonPrefetch = selectAmazonPrefetchNeighbors(remaining, current?.transaction.id);
    const amazon = useAmazonSplitOverlay({
        current,
        currentDecided,
        prefetchPrevious: amazonPrefetch.previous,
        prefetchNext: amazonPrefetch.next,
    });
    const displayItem = overlay.item ?? current;
```

**Observed insertion locus for a cheap receipt lookup (evidence of where the dual overlays live today — not a design decision):**

| Concern | Existing analog | Primary files |
|---------|-----------------|---------------|
| Gate (who fetches) | `needsLlmSuggest` / `needsAmazonSuggest` | `applyLlmOverlay.ts:9-24` |
| Neighbor pick | `select*PrefetchNeighbors` | `applyLlmOverlay.ts:65-112` |
| Fetch + React Query cache | `useLlmOverlay` / `useAmazonSplitOverlay` | `useLlmOverlay.ts`, `useAmazonSplitOverlay.ts` |
| Wire + pass to stage | `ClassifyWorkspace` | `ClassifyWorkspace.tsx:60-162` |
| Card chrome | `ClassifyStage` + optional context panel | `ClassifyStage.tsx:53-59,152-162,274-284` |

Miss-must-not-OCR/LLM constraint maps to **endpoint + gate behavior**, not to `applyLlmOverlay` merge:

- LLM fetch is already gated by `needsLlmSuggest` and only calls `POST /categorization/llm-suggest` (`useLlmOverlay.ts:67-76` → `Categorization.request2`).
- Amazon fetch calls `POST /categorization/amazon-suggest` (`useAmazonSplitOverlay.ts:95-104` → `Categorization.request3`).
- A receipt lookup that is a **separate cheap query**, enabled for non-Amazon cards, can run **in parallel** with LLM today; to **skip** LLM on a receipt hit, something must turn `needsLlmSuggest` / `currentEnabled` false (today only Amazon and certainty do that). On miss, leaving LLM enabled preserves today’s path.

Amazon auto-seeds split lines from overlay via effect (`ClassifyWorkspace.tsx:80-93`) — separate from LLM’s `applyLlmOverlay` merge (`applyLlmOverlay.ts:118-170`).

- Confidence: **high** for current wiring; **med** for “parallel hook + gate LLM on hit” as the only viable shape (parent may choose API composition instead — not researched here beyond web).
- Evidence: cited paths above; PRD step table is product intent only (`docs/prds/receipt-taking.md` §5.5).

### F4 — Query keys, enablement, prefetch implementation

LLM current query:

```30:43:apps/web/src/components/review/classify/useLlmOverlay.ts
    const currentEnabled = Boolean(current && needsLlmSuggest(current, currentDecided));
    const currentQuery = useQuery({
        queryKey: ['categorization', 'llm-suggest', ...(current ? overlayQueryKey(current) : ['none'])],
        queryFn: ({ signal }) => fetchOverlay(current?.transaction.id ?? '', signal),
        enabled: currentEnabled,
        // ...
    });
    usePrefetchOverlay(prefetchPrevious, 'prefetch-previous');
    usePrefetchOverlay(prefetchNext, 'prefetch-next');
```

Amazon current query uses `['categorization', 'amazon-suggest', ...overlayQueryKey]`; prefetch reuses the **same** key shape without a scope suffix (`useAmazonSplitOverlay.ts:37-48,83-92`). LLM prefetch keys include a scope segment (`prefetch-previous` / `prefetch-next`) so they do **not** populate the focused-card cache key (`useLlmOverlay.ts:55-64`) — asymmetry vs Amazon.

`overlayQueryKey` is transaction identity fields: id, date, amount, payee, import payee, memo (`applyLlmOverlay.ts:221-224`).

- Confidence: **high**
- Gap: whether a receipt prefetch should share Amazon-style shared keys or LLM-style scoped keys is undecided by existing code (two patterns coexist).

### F5 — Amazon overlay UI on the card (pattern to copy)

Wiring: only when `isAmazonTransaction(displayItem.transaction)`, workspace passes an `amazon` prop object into `ClassifyStage` (`ClassifyWorkspace.tsx:152-162`).

Stage behavior:

1. **Verdict line** prefers Amazon suggestion text over local LLM category (`ClassifyStage.tsx:94-100,162-169`).
2. **Loading banner** in verdict: “Loading Amazon order…” when asking and no overlay yet (`ClassifyStage.tsx:190-195`); LLM “Asking LLM…” suppressed when Amazon is asking (`183-188`).
3. **Details panel** below category catalog when overlay or error exists (`ClassifyStage.tsx:274-284`), styled with `.amazonDetails` border-top (`ClassifyStage.module.css:191-194`).
4. Panel content is `ClassifyAmazonContext`: label, loading, payment/match meta, order sections, rationale/notes, error, optional Sync button (`ClassifyAmazonContext.tsx:18-104`).

```274:284:apps/web/src/components/review/classify/ClassifyStage.tsx
            {amazon && (amazon.overlay || amazon.error) ? (
                <div className={classes.amazonDetails}>
                    <ClassifyAmazonContext
                        asking={false}
                        error={amazon.error}
                        overlay={amazon.overlay}
                        syncing={amazon.syncing}
                        onSync={amazon.onSync}
                    />
                </div>
            ) : null}
```

- Confidence: **high**
- Note: There is **no** receipt overlay component or prop today.

### F6 — Camera / capture / file upload in apps/web (Q7)

Searches under `apps/web/src` for `getUserMedia`, `mediaDevices`, `capture`, `type="file"`, upload, Dropzone, FormData, camera, receipt, OCR: **no matches**.

- Confidence: **high** (absence in web src)
- Gap: Did not exhaustively search non-src assets (e.g. HTML templates) beyond typical Vite `index.html`; no camera-related deps were required for this lane once src absence was clear. PRD acceptance items for camera/inbox remain product backlog, not implemented UI.

### F7 — Web → API client, proxy, env (HTTPS/phone relevance)

| Piece | Behavior | Path |
|-------|----------|------|
| Startup | `configureApiClient()` before render | `apps/web/src/main.tsx:20` |
| Base URL | Hard-coded `baseUrl: '/api'` | `apps/web/src/configureApiClient.ts:4-10` |
| SDK setup | `setupClient({ baseUrl, auth })` | `packages/web-sdk/src/setupClient.ts:24-30` |
| Vite proxy | `/api` → `http://localhost:4020` | `apps/web/vite.config.ts:7-16` |
| Env vars | No `VITE_*` / `import.meta.env` in `apps/web/src` | grep empty |
| HTTPS / host | Vite `server.port: 5173` only; no `https`, no `host: true` / LAN bind in config | `vite.config.ts:7-16` |

Relative `/api` means the browser talks to **same origin** as the Vite (or later static) host; phone camera/HTTPS reachability is therefore an **ops/hosting** concern relative to this client contract, not configured in app code today.

- Confidence: **high** for client contract; **med** that production static hosting also serves `/api` the same way (deploy layout out of lane scope).

### F8 — Routing surfaces (inbox vs filmstrip)

```56:60:apps/web/src/App.tsx
                        <Routes>
                            <Route path="/" element={<ReviewQueuePage />} />
                            <Route path="/classify" element={<ClassifyPage layout="card" />} />
                            <Route path="/classify/table" element={<ClassifyPage layout="table" />} />
                            <Route path="/trips" element={<TripsPage />} />
                        </Routes>
```

Nav labels: Queue, Classify, Table, Trips (`AppNav.tsx:10-24`).

| Route | Surface | Receipt-inbox-like? |
|-------|---------|---------------------|
| `/` | `ReviewQueuePage` — filterable **categorization** queue list (`QueueItemCard` expand details; no link into Classify) | **No** — txn review list, not receipt capture inbox |
| `/classify` | Card workspace: progress + **filmstrip** + stage (`ClassifyWorkspace.tsx:110-138`) | Filmstrip classify only |
| `/classify/table` | Table layout; narrow viewports redirect to card (`ClassifyPage.tsx:79-80`) | No |
| `/trips` | Trips | No |

URL `transactionId` search param focuses Classify (`queueSearchParams.ts`, `ClassifyPage.tsx:47,49-60`). No `/receipts` (or similar) route exists.

- Confidence: **high**
- Gap: PRD “receipt inbox” has **no** existing route or page to extend; Queue at `/` is a different product surface.

### F9 — SDK / receipt API surface (web)

Generated Categorization methods include `llm-suggest` and `amazon-suggest` (`packages/web-sdk/src/gen/sdk.gen.ts` around request2/request3 for Categorization). Grep of `packages/web-sdk/src` for `receipt`/`Receipt`: **no matches**.

- Confidence: **high** that web has no generated receipt client yet
- Gap: API route existence is out of this lane’s web scope (other research lanes).

## Evidence relationships (question → claim → path:line)

| Q | Claim | Path:line | Conf |
|---|-------|-----------|------|
| Q2 | `needsLlmSuggest` skips decided / no proposal / Amazon / certain | `applyLlmOverlay.ts:9-17` | high |
| Q2 | `needsAmazonSuggest` is Amazon payee + has proposal (ignores decided) | `applyLlmOverlay.ts:19-24` | high |
| Q2 | Prefetch = one prev + one next remaining neighbor per overlay type | `applyLlmOverlay.ts:65-112`; `ClassifyWorkspace.tsx:60-73` | high |
| Q2 | LLM hook fetches only when `needsLlmSuggest`; merges via `applyLlmOverlay` | `useLlmOverlay.ts:30-46,67-76` | high |
| Q2 | Amazon hook fetches `amazon-suggest`; does not use `applyLlmOverlay` | `useAmazonSplitOverlay.ts:35-48,95-104` | high |
| Q2 | Orchestration / insertion locus is `ClassifyWorkspace` beside LLM+Amazon hooks | `ClassifyWorkspace.tsx:58-75,139-162` | high |
| Q2 | Miss-free LLM path already independent of Amazon; receipt would need new gate to skip LLM on hit | `useLlmOverlay.ts:30-35` + Amazon short-circuit `applyLlmOverlay.ts:13-15` | high / med for shape |
| Amazon UI | Optional `amazon` prop → verdict override + details panel + `ClassifyAmazonContext` | `ClassifyStage.tsx:53-59,94-100,162-195,274-284`; `ClassifyAmazonContext.tsx:18-104` | high |
| Q7 | No camera, getUserMedia, file input, or upload UI in `apps/web/src` | grep absence across `apps/web/src` | high |
| API | Client baseUrl `/api`; Vite proxies to `localhost:4020`; no VITE env | `configureApiClient.ts:4-10`; `vite.config.ts:7-16`; `main.tsx:20` | high |
| Routing | Queue list + Classify filmstrip/table + trips; **no** receipt inbox route | `App.tsx:56-60`; `AppNav.tsx:10-24`; `ClassifyWorkspace.tsx:127-138` | high |

## Gaps

1. **No receipt lookup client or endpoint** in web-sdk/web UI — insertion is by analogy only.
2. **Two prefetch key styles** (LLM scoped vs Amazon shared) — which to mirror for receipt is unspecified by code.
3. **When to disable LLM on receipt hit** — not implemented; would require a new condition beyond Amazon/certain.
4. **Receipt inbox surface** — PRD concept; no route/page; `/` Queue is not a receipt inbox.
5. **HTTPS / phone → API** — not configured in Vite or env; relative `/api` only.
6. **Capture UI** — entirely greenfield in web.
7. Did not verify production reverse-proxy / static deploy layout for `/api` (out of lane).

## Stop decision

Lane questions answered with path:line evidence or named gaps. Further web dig into CSS polish or queue pagination does not change insertion locus. Stop; return pointer summary to parent. No architecture recommendation.
