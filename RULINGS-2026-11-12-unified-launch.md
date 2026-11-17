# Owner rulings — 12 November 2026: unified Babin Rentals launch

**Source:** Owner's 12 Nov 2026 conversation approving a coordinated launch of the Babin Rentals OS staff app, public company website, and integrated client portal; confirming the five website/portal settings launch defaults and rental date/time first.
**Scope:** Binding product/design decisions only. No running code, production settings, database mutations, credentials, domain records or payments are changed by this document.
**Launch target:** no later than **18 February 2027**, subject to release acceptance; never switch off Booqable until the replacement is actually proven ready.

## Latest explicit owner decisions

| ID | Decision | Implementation requirement |
| --- | --- | --- |
| UL-01 | Launch **Babin Rentals OS + full company website + client portal** as one coordinated release target, rather than postponing the full marketing website until after the booking-store launch. | Supersedes the *older interpreted scheduling choice* for a post-launch company site in B5 / PLAN / T10; does not erase the historic 27 Oct text. |
| UL-02 | **Rental pickup and return dates AND times are first-class booking inputs.** | Let clients choose pickup and return date/time before browsing availability; no dates-only placeholder. Account for Kathmandu local time, 06:00 rental-day rules, multi-day boundaries and correct duration/fees on server. Render clear BS + AD dates where required. |
| UL-03 | **Manual staff approval** is the launch default for online booking requests. | A request alone never confirms or reserves inventory. Staff confirmation is authorized, atomic, audited and conflict-checked. |
| UL-04 | **Guest booking requests enabled** by default. | A non-signed-in visitor may submit a *request* without a portal account, using server-mediated abuse protection; no guest access to account records, staff data or another client's requests. |
| UL-05 | **Public base rental pricing enabled** by default. | Publish only approved product/bundle prices, never purchase cost, margins, private account prices, sensitive stock or staff data. |
| UL-06 | **Personalized discounts enabled** for eligible, identity-verified, signed-in, securely bound clients. | Calculate eligibility and quoted price on the server; no anonymous/private price leakage, client-supplied price or self-assigned discount. |
| UL-07 | **Staff notifications enabled** for new online booking requests. | Authorized desk roles only; real backend events and retry/error handling; do not make the request disappear because a notification fails. |
| UL-08 | The five defaults in UL-03–UL-07 are **configurable by authorized Owner/Admin** in Babin Rentals OS → Settings → Website & Client Portal. | Server-enforced access control, audited changes, documented defaults and safe rollbacks. Settings are **design-approved defaults only**; do not modify live settings. |
| UL-09 | The three products share **one authoritative booking, inventory and pricing backend**. | Avoid separate booking truth, duplicate reservations and fake success. Preserve staff-only money and data visibility. |

## Not an automatic authorization

- No merging, publishing, DNS switch, payment activation, Booqable cancellation, live schema changes, live settings changes, staging spend or credential operations.
- Existing security law wins. Before opening any portal write capability, D-5 cross-client isolation and D-10 fresh-account/staff-data refusal must pass, with stricter database/API controls over UI.
- Retain secure verified-email login for client account access; **guest requests** are not equivalent to guest access to account information.
- Staff approval remains required for both guest and signed-in requests; public availability is informative until confirmation.
- Any unresolved gateway or legal/accounting requirement is an explicit launch gate or owner decision, never silently relaxed.

**Implementation handoff:** [Unified launch plan and first sprint](docs/plans/UNIFIED_LAUNCH_2027-02-18.md), [online booking spec](docs/ONLINE_BOOKING_SPEC.md), [go-live plan](PLAN.md).
