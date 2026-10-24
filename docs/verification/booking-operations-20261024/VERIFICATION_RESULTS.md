# Verification results — fixed local checkpoint

Checkpoint9dc9058837d1c163cd9332ad1ac16d5f71a20c4f. Active working copy was not switched or restored. Installed local dependencies are linked; no environment files were copied. All assertions use mock/in-process data.

| Check | Result | Scope |
|---|---|---|
| TypeScript | Exit0 | Exported checkpoint, strict configuration |
| Focused tests | 333/333, 14 files, exit0 | Operations, menu, header, modal, availability, cleanup and floor verbs |
| npm run lint | Exit0 | Exported checkpoint |
| npm run check:contrast | Exit0 | Exported checkpoint |
| npm run build | Exit0 | Exported checkpoint, mock build |
| Compiled mock browser proof | 16/16 PASS, exit0 | Preserved checkpoint; 12 layout cases and 4 interaction checks; source unchanged |
| npm run lint:progress | Exit0 | Active delivery entry after final browser results were recorded |

Source-walk fingerprint before/after: 34d968ba962ca548138c6a3af47c04d0ae5b46781481f9b7ad15246b7f52c70f. The full active-copy suite is NOT certified by these focused results.

Raw outputs are in the protected recovery verification-snapshot/artifacts/operations-proof folder. Older active-copy gate attempts in artifacts/booking-operations-20261024/gates* are historical/source-drifted. Saved browser evidence and new frozen-browser proof are labelled separately.

[Final gallery](frozen-checkpoint-9dc/gallery.html) and [raw browser report](frozen-checkpoint-9dc/report.json): 1440×900, 1024×768, 768×1024 and 390×844, each light/dark; 320px phone; 430px forced colors; 720×450 and 512×384 explicitly labelled 200%-equivalent CSS viewports. All 12 cases have zero page/content horizontal overflow, one footer and a visible 56px Confirm. Four further checks pass: nested scanner/shortcut/Escape ownership, opener focus restoration, dirty dock resize/keep/discard, and Warehouse money-blind Operations DOM. Zero page errors. The existing built-in seeded corpus is enabled only in a separate local mock artifact; non-loopback browser requests and service workers are blocked. No scans, signatures or Return confirmations were submitted. Native zoom and other operator roles are not certified by these browser checks.

The disposable database probe passes13 diagnostic assertions while confirming the missing partial-release behavior. The unchanged SQL chain does not implement the new policy. Native device, hosted auth/RLS/Storage, offline/reconnect and native display zoom remain untested.

Build exit0 includes existing non-fatal empty-has-selector and mixed static/dynamic-import warnings; the lint command separately exits0.
