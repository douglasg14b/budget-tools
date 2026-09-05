<!-- markdownlint-disable-file -->

# Lane Research: Contrarian — Python opencv-headless sidecar vs Node WASM/canvas

| Field | Value |
|-------|-------|
| Date | 2026-08-31 |
| Cycle | 1 |
| Wave | Contrarian |
| Lane | Challenge Node WASM/canvas as geometry host; evaluate opencv-python-headless Windows sidecar (our script, NOT document-preprocessor) via child_process |
| Posture | expansive |
| Status | Complete |
| Artifact path | .cursor/rpi-tracking/research/subagents/2026-08-31/contrarian-python-sidecar-subagent-research.md |
| Parent artifact (read-only) | .cursor/rpi-tracking/research/2026-08-31/receipt-image-prep-research.md |

## Lane inputs

- Scope: ~few dozen lines of our Python using cv2 — detect quad, warpPerspective, return color JPEG; exit non-zero + stderr on miss (NO_QUAD, DECODE_FAIL). NOT wrapping document-preprocessor (parent rejected W35–W40).
- Host: Node TypeScript Express on Windows; apps/api has sharp only (no canvas/jsdom). Receipt extract is low-frequency personal use.
- Repo already runs non-Node prerequisites for other features (dev:scorer .NET subprocess in package.json scripts).
- Retrieval: 2026-08-31.

## Actions

- Read parent artifact and sibling lanes: python-cpp-stacks, node-cv-bindings, scanic-jscanify-node, fail-loud-and-curl.
- Fetched PyPI opencv-python-headless metadata and opencv-python README (headless vs GUI, Windows DLL FAQ, licensing).
- pip download win_amd64 wheels for 4.14.0.94 and 5.0.0.93 (measured wheel sizes).
- Measured on this Windows host: Python 3.12.0 present; cv2 import cold ~1188 ms; five consecutive `python -c "import cv2"` spawn runs ~440–634 ms wall.
- Reviewed apps/api/package.json (sharp only), canvas@3.2.3 npm metadata (prebuild-install \|\| node-gyp).
- Did not edit parent artifact or product code.

## opencv-python-headless Windows wheel reality (2026)

| Claim | Evidence | Confidence |
|-------|----------|------------|
| Pre-built win_amd64 wheels on PyPI; no local OpenCV compile for standard install | PyPI classifiers Operating System :: Microsoft :: Windows; opencv-python README "special wheel binary packages … statically built OpenCV binaries" | high |
| Latest stable lines: 4.14.0.94 (2026-07-28) and 5.0.0.93 (2026-07-02) | PyPI version history fetched 2026-08-31 | high |
| Headless = no Qt/GUI; no cv2.imshow; smaller than full opencv-python; correct for API server | opencv-python README option 3 headless: "no GUI library dependencies … avoid heavy dependency chain" | high |
| Wheel sizes (win_amd64, measured pip download 2026-08-31): opencv-python-headless 4.14.0.94 = 41.0 MB; 5.0.0.93 = 43.8 MB; numpy 2.5.2 cp312 = 12.5 MB | Local pip download | high |
| Installed footprint ~54–56 MB for opencv-headless + numpy alone (wheel sum); unpack may be larger | Derived from wheel sizes | medium |
| cp37-abi3 stable ABI wheel — one wheel across Python 3.7+ on Windows | Wheel filename cp37-abi3-win_amd64.whl | high |
| Python 3.6–3.14 supported per PyPI classifiers | PyPI JSON 2026-08-31 | high |
| License: OpenCV core Apache 2.0; opencv-python packaging scripts MIT — compatible with personal-app criteria | opencv-python README Licensing section | high |
| Windows import can fail if VC++ 2015 redistributable or Media Feature Pack missing (Windows N/KN, Server) | opencv-python README Windows ImportError FAQ | high |
| Pick ONE of opencv-python / opencv-python-headless / contrib variants — shared cv2 namespace | opencv-python README install step 3 | high |

## child_process latency vs WASM init

| Cost bucket | Python sidecar (per-request spawn) | Node in-process WASM/canvas |
|-------------|-----------------------------------|----------------------------|
| Cold process + cv2 import | **Measured ~440–634 ms** wall (5 runs, python -c import cv2 on this host); first import in session ~1188 ms | N/A — same Node process |
| WASM / OpenCV.js first load | N/A | @techstark/opencv-js ~11.7 MB unpacked (sibling node-cv-bindings); OpenCV.js docs + community: multi-second async init; jscanify bundles ~29 MB opencv.js |
| scanic WASM warm-up | N/A | initialize() optional; **silent fallback to pure JS if WASM missing** (scanic-jscanify lane W42) — conflicts with fail-loud unless wrapper rejects |
| Per-image geometry (after runtime hot) | Native OpenCV CPU; sibling python-cpp-stacks cites tutorial pipeline typically tens–low hundreds ms for phone JPEG (unbenchmarked here) | scanic author claims ~10 ms warp; jscanify ~200 ms (marketing, scanic README) |
| IPC overhead | stdin JPEG in / stdout JPEG out — no base64 if binary pipe; temp files avoid pipe deadlock on large images | Buffer → ImageData/canvas shim (scanic/jscanify both need canvas/jsdom; no Buffer API) |
| Amortization | **Every extract pays spawn+import unless** persistent Python worker (FastAPI/uvicorn on localhost) or long-lived pool — sibling python-cpp-stacks: spawn ~50–300 ms cited + import | Express long-running server: WASM init **once per process**; canvas native load once |
| Receipt extract frequency | Personal app — likely acceptable at 0.5–1.2 s cold per receipt if rare | Better for burst / repeated prep in same API uptime |

**Contrarian read:** subprocess is cheaper to *ship* (no canvas) but more expensive per *cold call* than amortized WASM in a always-on API. For a personal API that stays up, WASM init is a one-time tax; Python spawn is a per-receipt tax unless daemonized.

## Operational cost: Python runtime vs canvas native build pain

| Dimension | Python opencv-headless sidecar | Node canvas + jsdom + WASM (scanic/jscanify) |
|-----------|-------------------------------|---------------------------------------------|
| New npm deps for geometry | 0 (spawn only; optional python-shell) | scanic OR jscanify + **canvas ^3.2.3 + jsdom** (jscanify forced; scanic documented) |
| Native compile risk | **Low** — pip wheels only | **Medium** — canvas install script: prebuild-install \|\| node-gyp rebuild (canvas@3.2.3 npm); ABI mismatch → compile/GTK pain (scanic-jscanify lane) |
| Second runtime | **Yes** — Python 3.x + venv pin in repo (e.g. scripts/receipt-prep/ + requirements.txt) | No — stays Node |
| Disk | ~55 MB venv (wheels) + ~1 KB script | scanic ~289 KB + canvas prebuild + jsdom OR jscanify ~29 MB + canvas + jsdom |
| Deploy contract | Document python path (venv), pip install step, loud ENOENT if missing | pnpm add canvas/jsdom/scanic; verify prebuild on @types/node 20 host (C9 vs scanic engines >=22 tension) |
| Precedent in repo | **Yes** — package.json already shells out to .NET scorer (dev:scorer) | Node-only is default for API |
| DOM shim | **None** — cv2.imdecode/imencode on bytes | Required — HTMLImageElement/ImageData globals |
| Fail-loud on miss | **Trivial in our script** — sys.exit(3) NO_QUAD; Node checks code !== 0 | Libraries return null/success:false (W24, W41); scanic WASM→JS fallback is silent degradation (W42) |
| Fail-loud on missing runtime | spawn ENOENT / import cv2 fail → non-zero; must **not** fall back to sharp-only prep (root-cause rule) | canvas load fail or missing WASM must throw at module init |
| Color JPEG for vision | Script controls cv2.imencode BGR JPEG; no forced binarize (unlike document-preprocessor W35) | Geometry libs output color warp; sharp still does CLAHE after |
| Code ownership | ~50 lines OpenCV recipe we maintain | Wrapper over scanic/jscanify APIs + miss mapping + canvas glue |

## Proposed sidecar shape (research only, not implemented)

```
stdin: JPEG bytes
stdout: warped color JPEG bytes
stderr: diagnostics
exit 0 = ok
exit 2 = DECODE_FAIL
exit 3 = NO_QUAD
```

Node: child_process.spawn(venv/python, [repoScript], {stdio: ['pipe','pipe','pipe']}); reject on non-zero; map stderr token to extract prep status. Optional: REceipt_PREP_PYTHON env via typed config (repository-spine). Startup probe: import cv2 once at API boot — loud failure if missing.

**Not in scope:** document-preprocessor package, FastAPI unless spawn latency unacceptable, Pyodide (3–5× slower, sibling W26).

## Claims SUPPORT sidecar

1. **Avoids canvas/jsdom entirely** — biggest Node geometry deploy pain point per scanic-jscanify-node lane; apps/api has no canvas today.
2. **Pre-built Windows wheels are mature** — 41–44 MB pip install vs canvas prebuild roulette and scanic Node>=22 vs repo Node 20 types (C9, W45).
3. **Native OpenCV speed** after import — faster per-op than WASM for contour+warp (qualitative; sibling lanes).
4. **Buffer-native I/O** — no DOM type shim; fits extract Buffer/JPEG pipeline (C5).
5. **Fail-loud is first-class** — our script owns exit codes; no scanic silent WASM→JS fallback (W42).
6. **Color JPEG under our control** — unlike rejected document-preprocessor binary default (W35).
7. **Apache 2.0** — meets license criteria (W9).
8. **Same recipe as tutorials** — PyImageSearch/LearnOpenCV pipeline (W8); imutils optional, not required.
9. **Repo already tolerates external runtimes** — .NET scorer subprocess precedent (package.json dev:scorer).
10. **Smaller Node dependency graph** — no +29 MB jscanify or new scanner wrapper deps.

## Claims SUPPORT stay-in-Node (counter-sidecar)

1. **Two-runtime operations** — Python version drift, venv refresh, PATH on new machine; not captured in pnpm lockfile.
2. **Per-receipt cold spawn tax** — measured ~0.44–0.63 s import-only on this host; full stdin/stdout pipeline likely **≥0.5–1.5 s** per extract without daemon (spawn + import + warp).
3. **WASM init amortized** in long-running Express — one multi-second load per API process vs every receipt paying Python startup.
4. **Python not a declared API prerequisite today** — only sharp in apps/api/package.json; sidecar adds setup doc + CI/local bootstrap.
5. **cv2 Windows DLL edge cases** — VC++ redist, Windows N Media Feature Pack (opencv-python FAQ); canvas has its own edge cases but sharp already proves native prebuilds work here.
6. **Subprocess binary pipes** — large multi-frame stitch JPEGs need careful stream handling or temp files; in-process avoids IPC copies.
7. **scanic is smaller payload** (~289 KB) if canvas prebuild succeeds — disk win vs 55 MB venv when both work.
8. **Debugging stays one language** — TypeScript breakpoints vs straddling Node+Python logs.
9. **Contrarian to contrarian:** owning OpenCV recipe in Python still means maintaining CV heuristics — same algorithm whether Python or @techstark/opencv-js, but Node keeps deploy unified.

## Evidence IDs (lane-local)

| ID | Claim | Source | Retrieved |
|----|-------|--------|-----------|
| L1 | opencv-python-headless 4.14 win_amd64 wheel 41.0 MB | pip download | 2026-08-31 |
| L2 | opencv-python-headless 5.0.0.93 win_amd64 wheel 43.8 MB | pip download | 2026-08-31 |
| L3 | numpy 2.5.2 cp312 win_amd64 12.5 MB | pip download | 2026-08-31 |
| L4 | Headless = no GUI; use for servers | opencv-python README | 2026-08-31 |
| L5 | Apache 2.0 OpenCV; MIT packaging | opencv-python README Licensing | 2026-08-31 |
| L6 | Windows DLL import failures — VC++ redist, Media Feature Pack | opencv-python README FAQ | 2026-08-31 |
| L7 | Python spawn+import cv2 ~440–634 ms (5 runs) | local measurement Windows host | 2026-08-31 |
| L8 | cv2 import cold ~1188 ms | local measurement | 2026-08-31 |
| L9 | apps/api deps: sharp only, no canvas | apps/api/package.json | 2026-08-31 |
| L10 | canvas 3.2.3: prebuild-install \|\| node-gyp | npm registry canvas@3.2.3 | 2026-08-31 |
| L11 | scanic needs canvas+jsdom; WASM silent JS fallback | scanic-jscanify-node lane / W42 | 2026-08-31 |
| L12 | jscanify ~29 MB; forces canvas+jsdom | W44, scanic-jscanify lane | 2026-08-31 |
| L13 | @techstark/opencv-js ~11.7 MB; async init | W3, node-cv-bindings lane | 2026-08-31 |
| L14 | document-preprocessor rejected — binary default, silent no-quad | W35, W36, parent synthesis | 2026-08-31 |
| L15 | Repo .NET subprocess precedent | package.json dev:scorer | 2026-08-31 |
| L16 | Spawn 50–300 ms cited + daemon amortization | python-cpp-stacks lane | 2026-08-31 |

## Gaps

- Full stdin/stdout JPEG warp subprocess benchmark not completed on host (tooling blocked); L7 is import-only lower bound.
- canvas@3.2.3 prebuild success not tested against repo Node 20 toolchain on this machine.
- @techstark/opencv-js WASM init ms not measured (package not installed in workspace).
- Persistent Python worker (localhost HTTP) latency not prototyped — would change sidecar calculus.
- Receipt fixture pass/fail rate for classical quad not compared Python vs scanic vs own opencv-js.
- opencv 4.14 vs 5.0 API stability for our minimal script not evaluated (5.0 is new line).

## Stop

Contrarian lane saturated for wheel reality, license, fail-loud shape, deploy comparison, and spawn-vs-amortized-WASM trade framing. Further work needs hands-on same-fixture benchmarks and optional daemon prototype — parent synthesis, not this lane.

## Evidence relationships

- Supports parent Q3 Python sidecar viability: L1–L6, L16.
- Challenges parent Node-first WASM/canvas default: L9–L12, L7 — canvas cost may exceed venv cost for geometry-only stage.
- Supports parent fail-loud rule vs scanic: L11; sidecar script exit codes align; scanic fallback does not.
- Distinguishes from rejected document-preprocessor: L14 — our script is color JPEG + exit 3 on miss.
- Relates to C9 Node 20 vs scanic engines >=22: sidecar avoids scanic engine constraint.
- Does **not** select final recommendation — presents balanced contrarian evidence for parent Wave 3 synthesis.
