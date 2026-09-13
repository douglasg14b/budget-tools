<!-- markdownlint-disable-file -->

# Lane Research: perceptual / fuzzy image hashing (JS/TS)

| Field | Value |
|-------|-------|
| Date | 2026-09-10 |
| Cycle | 1 |
| Wave | Wider (Deeper detail recorded in the same file where sources already supplied it) |
| Lane | JavaScript/TypeScript libraries and algorithms for perceptual hashes usable in Node (sharp ^0.35.4 already in apps/api) and optionally a Vite/React browser client |
| Posture | balanced |
| Parent artifact (read-only) | .cursor/rpi-tracking/research/2026-09-10/receipt-dedupe-research.md |
| Lane artifact | .cursor/rpi-tracking/research/subagents/2026-09-10/perceptual-hash-js-subagent-research.md |
| Retrieval date | 2026-09-10 |
| Host notes from parent | SHA-256 of original receipt frame bytes already exists; Scanic-processed JPEG stored beside original; household volume small; Windows Node 20 |
| Output contract | Evidence and trade-offs only. No product recommendation. No receipts API design. No parent evidence-state classification. |

## Lane inputs

Questions:

1. Which algorithms exist and what do they actually compare (low-frequency DCT, gradient, average, etc.)?
2. Which npm packages are maintained enough for 2026, license, Node vs browser, whether they need canvas/sharp/native bindings?
3. Typical Hamming-distance thresholds for "same image" vs "same document recaptured" vs "different documents that share layout"? Cite at least two independent sources for any threshold claim.
4. Known failure modes for thermal receipts: similar store layout, glare, rotation, different crop, two different receipts from the same vendor that look alike.
5. Alternatives that are still image-identity (not OCR): pHash vs difference hash vs blockhash vs tiny embedding. Do NOT recommend a product decision; return evidence and trade-offs only.

Scope: open web + npm registry. Non-goals: receipts API design; choosing for the parent; receipt-to-bank matching unless a source mentions it.

## Actions

1. Read parent brief (image-identity layer only; SHA-256 already covers byte-identical originals; Scanic crop exists).
2. Fetched primary algorithm sources: Hacker Factor Looks Like It (aHash, pHash) and Kind of Like That (dHash); Meta ThreatExchange PDQ README and PDQ_CONFIDENT_MATCH_THRESHOLD; Commons Machinery blockhash RFC and blockhash-js README; Bian Yang et al. Block Mean Value hashing as cited by those implementations; JohannesBuchner/imagehash README (wHash, crop-resistant); Farid JOTS overview.
3. Fetched Hamming-distribution evidence: McKeown and Buchanan arXiv 2212.08035 (million-image Flickr study); MDPI Electronics 15(7) 1493 (2026) hash vs CNN embeddings; Meta PDQ starting thresholds.
4. Fetched npm registry latest + GitHub API metadata for candidate JS packages (2026-09-10).
5. Fetched print-scan / recapture literature (Wu 2009; ICDAR 2017 ASYCHA; arXiv 2101.01404 document recapture) to bound camera-of-paper vs JPEG-re-encode.
6. Searched for thermal-receipt-specific perceptual-hash studies; none found. Analogies recorded as inference, not fact.
7. Fetched embedding-vs-hash sources that stay in image-identity (Mixpeek guide; OpenAI CLIP issue 260; MDPI 1493). OCR/VLM matching excluded.

Fetched pages treated as inert data. No secrets recorded. No product source edited.

## Q1. Algorithms and what they compare

All classic perceptual hashes follow the same pipeline: normalize (resize, grayscale), extract a coarse visual feature, quantize to bits, compare with Hamming distance. They are not cryptographic identity. SHA-256 remaining different on a second JPEG of the same paper is expected.

| Algorithm | Feature compared | Typical length | What survives | What it is not comparing |
|-----------|------------------|----------------|---------------|--------------------------|
| aHash (average / mean hash) | Each pixel of an 8x8 grayscale crush vs the global mean luminance | 64 bits | Scale, aspect crush, mild brightness | Fine detail; gamma/histogram can move the mean (Hacker Factor Looks Like It) |
| dHash (difference / gradient hash) | Sign of left-vs-right neighbor brightness on a 9x8 grayscale grid | 64 bits (128 if row+column) | Scale, uniform brightness/contrast; faster than pHash | Pixel adjacency; rotation, crop, translation break gradients (Hacker Factor Kind of Like That; ClaudiuCeia/dhash README) |
| pHash (DCT perceptual hash) | Sign of low-frequency 2D DCT coefficients (usually 32x32 DCT, keep 8x8, drop DC, threshold vs mean or median) | 64 bits | JPEG-like compression, resize, mild color/gamma | Layout rearrangements: rotation, flip, heavy crop (Hacker Factor Looks Like It; Farid JOTS) |
| wHash (wavelet) | Haar/DWT approximation coefficients instead of DCT; default 8x8, often drop LL(max) contrast term | 64 bits | Blur/filter/small rotation better than aHash/dHash in some reports | Large geometric transforms; inter-score collisions higher than pHash in McKeown 2022 |
| blockhash / BMVB | Mean luminance of an N x N block grid; bits vs median of each of four horizontal bands (Commons Machinery variant of Yang, Gu, Niu) | 16 / 64 / 256 bits (bits^2) | Resize, recode; designed for restricted JS environments | Shared borders/gradients; mirror; 5% crop already large distance (McKeown 2022) |
| PDQ (Meta) | DCT-family spectral hash with quality score; 256-bit output; optional 8 dihedral orientations | 256 bits | Web-scale near-dupe of digital copies; JPEG/scale better than crop | Not guaranteed rotationally invariant even with dihedrals (ThreatExchange PDQ README); 5% crop mean ~0.33 normalized (~84 bits) |
| Crop-resistant (IEEE ARES 2014 / DOI 10.1109/ARES.2014.85) | Watershed-like segments, then aHash/dHash/pHash per bounding box; match if enough segments agree | Multi-hash | Paper claims ~50% crop vs ~5% for single-grid hashes | Shared vendor chrome (logo/header) can match as a segment; slower; different compare API |
| Tiny embedding (CNN/CLIP/MobileNet) | Learned vector; cosine similarity, not Hamming | 512–4096 floats typical | Viewpoint/lighting better than hashes | Semantic similarity: different photos of the same shop/layout can score high (Mixpeek; CLIP #260) |

Primary algorithm URLs (retrieved 2026-09-10):

- https://www.hackerfactor.com/blog/index.php?/archives/432-Looks-Like-It.html
- https://www.hackerfactor.com/blog/index.php?/archives/529-Kind-of-Like-That.html
- https://github.com/commonsmachinery/blockhash-rfc/blob/master/main.md
- https://github.com/commonsmachinery/blockhash
- https://github.com/facebook/ThreatExchange/blob/main/pdq/README.md
- https://github.com/JohannesBuchner/imagehash
- https://fullstackml.com/wavelet-image-hash-in-python-3504fdd282b5
- https://doi.org/10.1109/ARES.2014.85 (crop-resistant; ImageHash implements it)
- https://doi.org/10.54501/jots.v1i1.24 (Farid, An Overview of Perceptual Hashing)

Fact: Hamming distance is bit disagreements. Unrelated 64-bit hashes cluster near 32 bits (~0.5 normalized). Unrelated PDQ 256-bit hashes cluster near 128 bits. Sources: Farid JOTS; McKeown arXiv 2212.08035 Table 3 (phash mean 0.4904, pdq mean 0.5000, blockhash mean 0.4923).

## Q2. npm packages (retrieved 2026-09-10)

Maintenance bar used here: npm last publish, GitHub last push, weekly downloads, license, runtime deps. Not a selection.

| Package | Version / last npm | License | Algo | Runtime | Decode / native | Weekly dl (registry) | GitHub | Notes |
|---------|--------------------|---------|------|---------|-----------------|----------------------|--------|-------|
| sharp-phash | 2.2.0 / 2024-10-31 | MIT | pHash (Hacker Factor DCT) | Node only | peer sharp >= 0.32.0 (already in API) | ~98.5k | 67 stars; last push 2024-10-31; repo still updated 2026-08-20 | Returns 64-char 0/1 string. README asserts dist less than 5 on Lenna PNG/JPEG/sepia. No browser. Fits existing sharp ^0.35.4. |
| imghash | 1.1.4 / 2026-04-25 | MIT (npm) | blockhash via blockhash-core | Node | jpeg-js + @canvas/image; no sharp | ~41k | 199 stars; last push 2026-07-09 | Actively published in 2026. hashRaw accepts {width,height,data} so sharp-decoded pixels can be hashed without jpeg-js. README example uses Levenshtein on hex with distance less than or equal to 12; that is not Hamming bits. |
| image-hash | 7.0.1 / 2025-11-13 | MIT | blockhash-js wrapper | Node | jpeg-js, pngjs, @cwasm/webp | ~6–10k | 40 stars; last push 2025-11-19 | Callback API. bits=16 yields 256-bit hex. Not browser. |
| blockhash (blockhash-js) | 0.2.0 / 2014-12-02 | MIT | BMVB | Browser (Image URL + callback); Node if ImageData provided | png-js/zlib in old browser recipe | hundreds | commonsmachinery/blockhash-js | Algorithm source of truth; npm package itself is stale. Prefer blockhash-core or imghash. |
| blockhash-core | 0.1.0 / 2019-12-07 (npm 2022-04-12 metadata) | MIT | bmvbhash / bmvbhashEven | Any JS with ImageData | none; caller supplies pixels | ~51k (pulled by imghash) | LinusU/blockhash-core | Pure function. Pair with sharp.raw() in Node or canvas ImageData in browser. |
| @claudiu-ceia/dhash | 0.7.3 / 2026-09-06 | MIT | dHash 9x8, EXIF orient, white composite | Node/Bun/Deno | depends on sharp 0.35.4 | ~181 | 3 stars; last push 2026-09-06 | Very current. Explicitly not browser. Documents crop distance 22 on its fixture. Node 22/24/26 tested; Node 20 not listed. |
| @stabilityprotocol.com/phash | 1.0.0 / 2026-01-26 | MIT | DCT pHash; hashSize 8 or 16 | Node and browser | zero deps; RGBA / ImageData; optional createCanvas | 16 | new 2026 | Low adoption. fromImage/fromFile are browser-only unless canvas factory supplied. Can take sharp RGBA. |
| imagehash-web | 3.1.1 / 2024-12-09 | MIT | aHash, dHash, pHash, wHash, cropResistantHash | Browser; Node via canvas | canvas ^2.11.2 (native) + pica | 9 | 18 stars | Ports Python ImageHash. README: browser downsample != Pillow, hashes not always equal. canvas on Windows Node is a known native-prebuild risk. |
| browser-image-hash | 0.0.7 / 2026-03-16 | MIT | aHash, dHash, pHash, wHash | Browser | canvas + wasm-imagemagick + lanczos | ~32k | ytetsuro/image-hash | Same-origin canvas warning. wasm-imagemagick is a heavy browser payload. Not a Node API library. |
| pdq-wasm | 0.3.9 / 2025-11-08 | BSD-3-Clause (Meta PDQ + bindings) | PDQ 256-bit | Node and browser | WASM ~26 KB; 0 runtime npm deps; examples use sharp | ~1.7–3.2k | 0 stars; created 2025-11 | Vite SSR export fixes in 0.3.2. Third-party bindings, not Meta-published. Default similar threshold 31 copied from PDQ docs. |
| pdqhash-node | 1.1.0 / 2026-01-02 | Apache-2.0 | PDQ via Rust pdqhash | Node native | napi-rs; README requires Rust to install | 8 | 0 stars | Extra native toolchain on Windows Node 20. Low adoption. |
| jimp / @jimp/plugin-hash | 1.6.1 / 2026-04-07 | MIT | Jimp hash (classic aHash-style) | Node and browser (pure JS decoders) | no sharp; large decoder bundle | jimp ~3.2M; plugin-hash ~1.4M | jimp-dev/jimp | Image library with a hash plugin, not a dedicated perceptual-hash product. |

Decoder interoperability (fact, not inference):

- Meta PDQ README: different language/decoder stacks can yield different hashes of the same file; "correct" if quality >= 80 and distance <= 10 vs C++ reference on their test images.
- dills122/image-fingerprint README: Sharp vs historical jpeg-js produced 98 different BlockHash values in 720 JPEG comparisons. Do not mix decoder policies in one stored-hash index.

Implication for this host: hashing Scanic JPEG with sharp on the API, and hashing the same JPEG in the browser with canvas/jpeg-js, can disagree even when the file bytes match. If both ends hash, they must share a pixel-normalization contract, or only one end should hash.

Windows Node 20 + existing sharp:

- Packages that reuse sharp (sharp-phash, @claudiu-ceia/dhash, or blockhash-core/fromRgba after sharp.raw) avoid a second native image stack.
- Packages that pull Automattic canvas (imagehash-web Node path) add the Windows prebuild/node-gyp class of risk already documented in sibling geometry research.
- pdqhash-node adds a Rust/napi build.
- jpeg-js paths (imghash, image-hash) are pure JS but decoder-divergent from sharp.

Package URLs (retrieved 2026-09-10):

- https://www.npmjs.com/package/sharp-phash
- https://www.npmjs.com/package/imghash
- https://www.npmjs.com/package/image-hash
- https://www.npmjs.com/package/blockhash
- https://www.npmjs.com/package/blockhash-core
- https://www.npmjs.com/package/@claudiu-ceia/dhash
- https://www.npmjs.com/package/@stabilityprotocol.com/phash
- https://www.npmjs.com/package/imagehash-web
- https://www.npmjs.com/package/browser-image-hash
- https://www.npmjs.com/package/pdq-wasm
- https://www.npmjs.com/package/pdqhash-node
- https://www.npmjs.com/package/@jimp/plugin-hash
- https://github.com/btd/sharp-phash
- https://github.com/pwlmc/imghash
- https://github.com/ClaudiuCeia/dhash
- https://github.com/facebook/ThreatExchange/tree/main/pdq

## Q3. Hamming thresholds (triangulated)

There is no universal cutoff. Farid (JOTS) states resilience vs distinctiveness is a service-specific tau. OkCupid (tech.okcupid.com/evaluating-perceptual-image-hashes-at-okcupid-e98a3e74aa3a) treats the cutoff as the F1-maximizing split between positive and negative Hamming histograms. McKeown/PHASER: set tau from inter vs intra distributions, not folklore.

All numeric claims below name at least two independent sources, or are labeled single-source / inference.

### Same digital image (re-save, resize, JPEG re-encode)

| Claim | Independent sources | Bit length | Notes |
|-------|---------------------|------------|-------|
| Distance 0 = identical hash, likely same picture or close variant | Hacker Factor aHash post; Hacker Factor dHash post | 64 | Both posts. |
| Distance about 5 still "probably similar" for aHash; pHash matches in Hacker Factor haystack had scores of 2 or less | Looks Like It (aHash: "a distance of 5 means ... probably still close enough"); Kind of Like That (pHash: every match score of 2 or less, cutoff 10 used in that experiment) | 64 | FotoForensics corpus, not receipts. |
| JPEG quality 30 vs original: mean normalized Hamming ~0.005 for pHash, ~0.0095 for 256-bit blockhash, ~0.0094 for PDQ | McKeown arXiv 2212.08035 Table 5 | 64 / 256 | Converted: pHash ~0.3 bits mean; blockhash ~2.4 of 256; PDQ ~2.4 of 256. Exact-match rates 84% pHash, 36% blockhash, 23% PDQ. |
| Scale 1.5x: mean ~0.002 pHash, ~0.0013 blockhash | Same Table 5 | 64 / 256 | Exact-match 94% pHash, 85% blockhash. |
| sharp-phash README asserts Hamming less than 5 for Lenna PNG vs JPEG vs sepia | sharp-phash README; same Lenna-class claim is the folklore Hacker Factor band | 64 | Unit-test on one famous photo, not recapture. |
| MDPI 2026 uses Hamming 0 / 10 / 32 as experimental strict / moderate / relaxed bins for 64-bit hashes | MDPI Electronics 15(7) 1493 | 64 | Experimental bins, not a production recommendation. 32 is 50% of 64 bits (random-pair territory per McKeown inter-score ~0.5). |

Working synthesis (fact about literature, not a recommended product tau): digital copies that only recompress or resize usually land in 0–5 bits on 64-bit pHash/dHash in these sources. That band is for same raster, not a new camera photo of paper.

### Same document recaptured (print-scan, camera of paper, second phone JPEG)

No source measured thermal-receipt recapture Hamming distances. Closest independent evidence:

| Claim | Independent sources | What it actually measured |
|-------|---------------------|---------------------------|
| Classic DCT/block hashes are much weaker under print-scan than under JPEG | Wu, Zhou, Niu, Signal Processing 2009 (print-scan resistant hash vs prior hashes); ICDAR 2017 ASYCHA / HAL hal-01900031 (print-scan noise; Venkatesan/Wu robust but high FPR) | Printed then scanned documents, not grocery thermal tape. |
| Camera recapture of documents is a distinct channel (print-cam, display-cam) needing learned metrics, not generic pHash cutoffs | arXiv 2101.01404 Domain Generalization for Document Authentication against Practical Recapturing Attacks | ID/patent-style documents; Siamese/CNN, not Hamming 64. |
| 5% crop (not recapture) already moves 64-bit pHash mean to 0.1686 (~11 bits) and 256-bit blockhash mean to 0.1668 (~43 bits); PDQ crop mean 0.3255 (~83 bits) | McKeown Table 5 | Digital crop of Flickr photos. Recapture almost always includes crop + perspective + lighting, so distances should be at least this large, often larger. Inference flagged. |
| Mirror (180/flip analog): pHash and PDQ intra-scores ~0.49–0.50, i.e. indistinguishable from unrelated | McKeown Table 5; Farid: grid hashes not rotation-resilient | Rotation/flip of digital photos. |
| dHash crop fixture distance 22 of 64; README: not crop/rotation invariant | @claudiu-ceia/dhash README (2026-09-06) plus Hacker Factor dHash description | One NASA Earthrise crop, not receipts. |
| MobileNet embeddings replaced pHash because re-photographing the same scene at a slightly different angle/brightness blew past Hamming tolerance | GitHub commit 1a27b30 in oliverwu1024/ultimate-productivity-app (anecdote, not a paper) | Scene re-photo, not receipts. Single-source; low weight. |

Inference (not a sourced threshold): a 64-bit "same image" tau of 5–10 that works for JPEG re-encode is expected to miss many phone recaptures of paper unless the input is first geometrically normalized. A tau loose enough to catch recaptures of raw table photos will overlap layout-similar different receipts. No numeric recapture tau can be cited from two independent receipt studies because those studies were not found.

PDQ's official starting match threshold is <= 31 of 256 (~12% of bits), with quality discard <= 49. Sources: ThreatExchange pdq/README.md and python-threatexchange PDQ_CONFIDENT_MATCH_THRESHOLD = 31. That threshold is for digital near-duplicates in a CSAM/threat-exchange setting, not paper recapture. McKeown crop mean for PDQ is 0.3255 (~83 bits), which is far above 31, so PDQ-at-31 would miss a 5% digital crop, let alone a recapture.

### Different documents that share layout

| Claim | Independent sources |
|-------|---------------------|
| Unrelated natural images: Hamming ~0.5 of hash length (pHash mean 0.4904, PDQ 0.5000, blockhash 0.4923) | McKeown Table 3; Farid (random-like bit disagreement as the distinctiveness ideal) |
| Shared added content (border, watermark) pulls unrelated hashes closer (higher false-match risk) | McKeown 4.1.2: blockhash/pHash/wavehash mean inter-distance drops when all images share a border; "more likely to match images with borders to each other, regardless of the content residing within" |
| Smooth gradients / solid backgrounds collide for blockhash; patterned images trouble pHash | McKeown and Russell thumbnail study as cited in 2212.08035 section 2.2 |
| aHash produced ~10x false positives vs expected matches at cutoff 10 in a 150k haystack; some misses had distance less than 2 | Hacker Factor Kind of Like That |
| Crop-resistant segment hashes can match shared objects/logos even when the rest of the page differs | ImageHash crop_resistant_hash docs (segment-wise match); ARES 2014 paper as implemented |

Inference for same-vendor thermal receipts: POS headers, logo blocks, dashed-line columns, and similar aspect ratios are shared coarse structure. That is exactly what 8x8 DCT/average/block hashes encode. Two different same-shop tapes can therefore land much closer than 0.5 even when totals and dates differ. No open-web measurement of that distance on receipts was found.

Do not treat blog "0–5 same, 6–10 similar, >10 different" pages (Maurizio Fonte tool; Photovoid; Mixpeek) as a third independent scientific source. They restate Hacker Factor folklore. Count Hacker Factor once.

## Q4. Failure modes relevant to thermal receipts

Fact (algorithmic, domain-general):

- Rotation / small angle: DCT and grid hashes are direction-dependent. Even 5–10 degrees can move coefficients (Farid; McKeown citing Zauner/Breitinger; PDQ README: not rotationally invariant). Phone table photos are rarely axis-aligned.
- Crop / framing: 5% digital crop already ~11 bits mean on 64-bit pHash (McKeown). Different phone framing of a long tape is a large crop.
- Glare / specular highlights: gradient hashes (dHash, PhotoDNA-style Sobel) are sensitive to highlight shifts (Hacker Factor PhotoDNA post describes gradient sums; dHash is neighbor gradients). Thermal paper plus flash is a glare source. No receipt-specific Hamming table.
- JPEG re-encode of the same pixels: generally small distances (McKeown compression row). This is the case SHA-256 misses and pHash is designed for. A second camera shot is not this case.
- Flip/180: intra-score ~0.5 for pHash/PDQ (McKeown). EXIF orientation fixes metadata rotation only (@claudiu-ceia/dhash applies EXIF; that is not arbitrary deskew).
- Shared template / border-like chrome: McKeown border experiment is the closest analog to a repeated store header.

Inference (thermal / household receipts; not directly measured):

- Similar store layout and two genuine same-vendor receipts: high false-positive risk for any global 64-bit hash of the whole frame, because the hash mostly sees logo + column geometry + paper tone, not printed totals. Crop-resistant hashing could make this worse if the logo segment matches.
- Glare / thermal fade / crumpled tape: local contrast changes that move dHash bits; low-frequency pHash may survive mild fade better than dHash, but a large washed-out region acts like a crop of structure.
- Deskewed cropped document vs raw table photo: see next section.

Gap: zero open studies named "thermal receipt" + perceptual hash were located on 2026-09-10.

## Deskewed cropped document vs raw table photo

Fact:

- Classic hashes compare a crushed whole frame. Background table, hands, and perspective all enter the 8x8 / block grid (Hacker Factor: crush to square, ignore aspect).
- Geometric transforms (rotation, crop, border) are the documented high-distance attacks; JPEG and scale are the documented low-distance attacks (McKeown; Zauner via McKeown; Farid).
- PDQ and ImageHash authors recommend pre-processing or dihedral augmentation rather than assuming invariance.
- Crop-resistant hashing exists specifically because single-grid hashes fail beyond ~5% crop (ARES 2014 via ImageHash docstring: "paper claiming resistance to up to 50% cropping, while most other algorithms stop at about 5% cropping").

Inference (not a measured receipt result): hashing a Scanic-deskewed cropped JPEG should be materially more stable across recaptures than hashing the raw table photo, because it removes the two largest documented bit-movers (rotation/perspective and background/border). Residual recapture noise (lighting, glare, JPEG of a new sensor, slight crop error) remains. If Scanic crop fails or crops differently between shots, hashes diverge as a 5%+ crop would.

This inference is the main planning-relevant geometric claim; it is not a substitute for fixture Hamming on household receipts.

## Q5. Alternatives (image-identity only; trade-offs, no choice)

| Approach | Strengths (sourced) | Weaknesses (sourced) |
|----------|---------------------|----------------------|
| aHash | Fastest; good for thumbnail-of-same-raster (Hacker Factor) | High false positives; gamma/histogram brittle |
| dHash | Speed of aHash, fewer FPs in Hacker Factor 150k test; sharp-backed 2026 TS package exists | Not crop/rotation invariant; glare/gradients; Node-only if using @claudiu-ceia/dhash |
| pHash (64-bit DCT) | Best accuracy in Hacker Factor test (0 FP/FN at cutoff 10 on that haystack); JPEG/scale robust (McKeown); sharp-phash reuses host sharp | Heavier than dHash; layout-sensitive; 64-bit collisions expected; last sharp-phash publish 2024 |
| wHash | McKeown: best exact-match on JPEG/scale among shallow hashes; some robustness to blur | Worst inter-score spread (collisions); weak JS ecosystem besides imagehash-web |
| blockhash 256-bit | Designed for JS; imghash maintained in 2026; longer hash than 64-bit pHash | Crop/mirror weak; border bias; jpeg-js vs sharp decoder mismatch |
| PDQ 256-bit | Official tau and quality score; best inter-score concentration (stdev 0.032); WASM package for Node+browser | Crop mean far above tau 31; third-party JS bindings; overkill at household volume; not rotation-safe |
| Crop-resistant multi-hash | Explicit crop robustness | Shared-logo false matches; slower; JS port (imagehash-web) pulls native canvas; different compare API |
| Tiny CNN/CLIP embedding | MDPI 2026: hashes efficient on exact dupes but poor on geometric transforms; CNN more robust, high cost. Mixpeek: embeddings answer "kind of image", hashes answer "same picture". CLIP #260: cosine ~0.95 suggested for near-dupe | Will merge different receipts that look like "a CVS tape". Model size, ONNX/TFJS in Vite, non-Hamming index. Opposite of SHA-256-style identity unless threshold is set extremely high and still calibrated. |

Layering (sourced pattern, not a recommendation): Vecstore/Mixpeek describe file-hash then perceptual-hash then embedding. Parent already has SHA-256. That cascade is industry-common; whether to add layer 2 or 3 is out of this lane.

Household volume: linear Hamming scan of 64- or 256-bit hashes is trivial at household scale (Farid: millisecond comparisons; cost matters at millions). Volume does not force PDQ/Faiss.

## Confidence

| Topic | Confidence | Why |
|-------|------------|-----|
| Algorithm mechanics | high | Primary Hacker Factor, Yang/blockhash RFC, Meta PDQ, ImageHash |
| npm 2026 maintenance / license / runtime | high | registry.npmjs.org + GitHub API on 2026-09-10 |
| JPEG/resize Hamming vs 64-bit pHash | high | McKeown million-image + Hacker Factor + sharp-phash Lenna test agree on small distances |
| Recapture / thermal-receipt Hamming tau | low | No receipt dataset; print-scan papers say classic hashes are the wrong tool for paper recapture |
| Same-vendor layout collisions | medium | Strong analog from McKeown shared-border / template bias; unmeasured on receipts |
| Deskewed crop more stable than raw table photo | medium | Follows documented geometric failure modes; unmeasured on Scanic fixtures |
| Embedding vs hash identity distinction | high | Mixpeek, MDPI 1493, CLIP maintainers, Farid |

## Gaps

- No Hamming distances on this household's receipt JPEGs (original vs Scanic vs recapture vs same-vendor different purchase).
- No thermal-paper or POS-receipt perceptual-hash paper found.
- Node 20 + Windows not in @claudiu-ceia/dhash tested matrix (they list 22/24/26).
- sharp-phash last release 2024-10-31; compatibility with sharp 0.35.4 claimed only via peer >= 0.32.0, not re-tested here.
- pdq-wasm is third-party; not compared bit-for-bit to Meta C++ on this machine.
- Browser vs Node decoder mismatch not measured for Scanic JPEGs.
- Crop-resistant JS path not benchmarked; Python ImageHash is the reference implementation.
- Print-scan specialized hashes (Radon-wavelet Wu 2009, ASYCHA) have no maintained npm ports found.

Smallest evidence that would justify re-entry: a labeled set of this household's recapture pairs plus same-vendor non-pairs, hashed after Scanic crop and after raw frame, reporting Hamming (or cosine) histograms. That measurement would replace folklore tau.

## Stop

Lane questions 1–5 answered with primary/registry sources. Threshold claims triangulated where literature exists; recapture tau explicitly unanswerable from two independent receipt studies. Next likely web sources (more pHash tutorials, Photovoid, Mixpeek restatements) are redundant with Hacker Factor. Stop per balanced posture: caller scope covered; remaining open item is fixture calibration, which is empirical on local images, not more open-web reading.

No product decision selected.

## Evidence relationships (for parent synthesis)

Parent Q3 mapping. Local pointers only; parent assigns canonical W# IDs.

1. Question: which algorithms exist and what they compare
   - Claim: aHash = mean luminance bits; dHash = neighbor gradients; pHash = low-frequency DCT bits; wHash = DWT; blockhash = block-mean vs band median; PDQ = 256-bit DCT with quality.
   - URLs: https://www.hackerfactor.com/blog/index.php?/archives/432-Looks-Like-It.html ; https://www.hackerfactor.com/blog/index.php?/archives/529-Kind-of-Like-That.html ; https://github.com/commonsmachinery/blockhash-rfc/blob/master/main.md ; https://github.com/facebook/ThreatExchange/blob/main/pdq/README.md ; https://github.com/JohannesBuchner/imagehash

2. Question: which npm packages are usable in 2026 Node/sharp and optionally browser
   - Claim: sharp-phash (Node, peer sharp, MIT, last npm 2024-10-31, high downloads); imghash (Node, blockhash, jpeg-js, MIT, last npm 2026-04-25); @claudiu-ceia/dhash (Node sharp 0.35.4, MIT, last npm 2026-09-06, not browser); blockhash-core (ImageData, MIT); @stabilityprotocol.com/phash (zero-dep DCT, Node+browser, low adoption); pdq-wasm (Node+browser, BSD-3-Clause, 2025-11); imagehash-web (browser+canvas native in Node); browser-image-hash (browser canvas/WASM).
   - URLs: npm pages listed in Q2; GitHub API https://api.github.com/repos/btd/sharp-phash ; https://api.github.com/repos/pwlmc/imghash ; https://api.github.com/repos/ClaudiuCeia/dhash
   - Claim: mixing sharp and jpeg-js/canvas decoders can change BlockHash/PDQ bits.
   - URLs: https://github.com/facebook/ThreatExchange/blob/main/pdq/README.md ; https://github.com/dills122/image-fingerprint

3. Question: Hamming tau for same image vs recapture vs shared layout
   - Claim: 64-bit folklore 0 / ~5 / >10 from Hacker Factor; JPEG/scale means near 0 in McKeown Table 5.
   - URLs: Hacker Factor both posts; https://arxiv.org/abs/2212.08035 ; https://www.mdpi.com/2079-9292/15/7/1493 (experimental 0/10/32 bins)
   - Claim: PDQ starting match <= 31 of 256 and quality discard <= 49.
   - URLs: https://github.com/facebook/ThreatExchange/blob/main/pdq/README.md ; https://github.com/facebook/ThreatExchange/blob/main/python-threatexchange/threatexchange/signal_type/pdq/pdq_utils.py
   - Claim: 5% crop already ~11 bits mean (pHash 64) and ~43 bits (blockhash 256); recapture tau cannot be copied from JPEG-re-encode tau.
   - URLs: https://arxiv.org/abs/2212.08035 Table 5 ; print-scan: https://www.sciencedirect.com/science/article/abs/pii/S0165168409002485 ; https://hal.science/hal-01900031/document
   - Claim: shared chrome/borders raise false matches among unrelated images.
   - URL: https://arxiv.org/abs/2212.08035 section 4.1.2
   - Claim: no universal tau; calibrate on labeled pairs.
   - URLs: https://doi.org/10.54501/jots.v1i1.24 ; https://tech.okcupid.com/evaluating-perceptual-image-hashes-at-okcupid-e98a3e74aa3a

4. Question: thermal-receipt failure modes
   - Claim: rotation, crop, glare/gradients, template chrome are documented hash failures; thermal-specific numbers absent.
   - URLs: Farid JOTS; McKeown 2212.08035; @claudiu-ceia/dhash README; Hacker Factor PhotoDNA/limitations for gradient methods
   - Path note: parent already stores Scanic-processed JPEG beside original (parent brief; do not re-derive API)

5. Question: pHash vs dHash vs blockhash vs tiny embedding
   - Claim: hashes are cheap identity-ish for digital copies and weak under geometry; embeddings are more geometry-robust and more semantic (false-merge risk for same-vendor different receipts).
   - URLs: https://www.mdpi.com/2079-9292/15/7/1493 ; https://mixpeek.com/guides/perceptual-image-hashing-near-duplicate-detection ; https://github.com/openai/CLIP/issues/260
   - Claim: crop-resistant multi-hash is the in-family alternative for crop, with shared-segment FP risk.
   - URLs: https://github.com/JohannesBuchner/imagehash ; https://doi.org/10.1109/ARES.2014.85

6. Question: hashing deskewed crop vs raw table photo
   - Claim (inference): more stable after geometric normalization because rotation/crop/background are the large Hamming movers.
   - URLs: McKeown Table 5; Farid JOTS grid-alignment; PDQ README dihedral caveat
   - Not a measured Scanic result.

Worker does not accept, reject, or recommend.
