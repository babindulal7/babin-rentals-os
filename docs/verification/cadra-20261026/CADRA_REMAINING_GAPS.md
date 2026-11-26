# Cadra remaining gaps and acceptance boundaries

- Migrations 0178, 0179 and 0180 are local source changes. No migration has been applied to hosted Supabase; no production verification or launch is implied.
- Fleet lanes require actual fleet IDs and recorded scheduling intervals. Free-text rental vehicle/number-plate descriptions are not joined by name. Warehouse bays lack an authoritative allocation contract and remain unavailable.
- Distinct crew registries retain distinct IDs. Missing/ambiguous assignment dates remain unallocated; no identity crosswalk is invented.
- Independently scheduled crew, transport/dispatch or delivery jobs must be handled in their existing workspace before a Calendar move. Calendar does not silently retime them.
- Rescheduling excludes Packed and later stages and never changes duration, pricing, invoices, payments, deposits or custody evidence. Existing Extend remains the path for eligible extensions.
- Agreement replacement records authorized staff attestation and retains actual uploaded/drawn evidence. A stored content hash is provenance; this feature does not authenticate a signer's identity cryptographically or provide certificate-based PDF signatures.
- Drawn amendments preserve the original separately and identify it by hash. Long signer details that cannot fit the rendered page must fail with an upload alternative rather than clip.
- Legacy original agreement paths that cannot be securely resolved/read do not permit signing or rescheduling. No orphan-storage remapping or Client Portal write is introduced.
- The existing custody-signature flow is separate. Its legacy image-persistence/identity/device limitations are not certified by the new schedule-signing flow.
- Real iPhone/iPad camera/scanner permissions, stylus/touch/rotation/virtual keyboard, hosted object policies, offline/reconnect and screen-reader use remain independent checks unless an executed result is explicitly recorded.
- A responsive screenshot shows layout at the tested state; it does not establish actual hosted data access, successful physical receipt or production readiness.
