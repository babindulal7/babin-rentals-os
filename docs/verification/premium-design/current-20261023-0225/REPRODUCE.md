# Local browser reproduction

From the repository root, start the existing mock preview on 127.0.0.1:3011 (no live data). Then run these sequentially:

    node docs/verification/premium-design/current-20261023-0225/browser.mjs after all
    node docs/verification/premium-design/current-20261023-0225/browser.mjs checks
    node docs/verification/premium-design/current-20261023-0225/additional.mjs checks

These Windows runners use installed Chrome, fresh temporary profiles and CDP ports 9263/9264, and block requests outside the local preview. Do not run two copies on the same ports. Results are written beside these runners. Existing test scripts and command receipts are documented in CURRENT_VERIFICATION.md. No remote command is part of reproduction.
