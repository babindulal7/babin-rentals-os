# Smart Intel production schema inspection

Date: 16 October 2026 (Asia/Katmandu)

Project: sxguwvgoserhdolewibb. Connector access verified after reconnection; project reports ACTIVE_HEALTHY.

## Observed in read-only transactions

- booking_notes, intel_entity_notes, intel_field_definitions and intel_field_values exist with RLS enabled.
- Both note tables restrict management visibility to Owner/Admin/Manager and exclude Accounts from operations visibility. Archived notes are excluded from reads.
- Custom field values consult intel_field_allowed: operational values require staff; personal values allow Owner/Admin/Manager/Coordinator/Accounts; financial values allow Owner/Admin/Manager/Accounts.
- All four Intel tables have unique client_uuid indexes and enabled audit triggers.
- booking_lines_v and products_v explicitly mask financial columns through auth_can_view_money(). The live helper excludes Warehouse/Technician/Driver/Client.
- Payment, security-deposit and deposit-movement SELECT policies use the money or finance-role helpers. The finance helper allows Owner/Admin/Manager/Accounts.
- Migration ledger contains 0143_smart_intel_notes_fields. Ledger entries do not by themselves certify application behavior or schema parity with local source.

## Limits

This inspected database catalogs and function/view definitions, without reading note bodies, field values or client financial records. It did not test authenticated JWTs, PostgREST responses, card DOM, payment arithmetic or real-device behavior. The connector's database inspection identity is not a Warehouse/Accounts/Manager application session.

Some protected base tables have anon SELECT grants, so their RLS predicates remain essential. Those grants alone do not demonstrate that any data is readable. The inspected masked views have no anon SELECT grant.

No migration, DDL, persistent role change or business-data write was executed. This is not staging certification or production release sign-off. Signed-in application checks and physical iPad/Safari testing remain pending.
