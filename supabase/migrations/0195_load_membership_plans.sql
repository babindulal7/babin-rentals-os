-- =============================================================================
-- Migration 0195: Load Babin's Membership Plans (T8-01, D21, D32)
--
-- Rulings:
--   D21: Memberships live at go-live.
--   D32: How membership plans get in: Babin sends a table; it is loaded for him.
--
-- T8-01 loads the 5 standard membership plans into public.membership_plans:
--   1. Academy: Rs 6,000/yr, 10% individual, 5% bundle, 3 bookings/mo, 1 rental, 1 user, Rs 0 default credit, 12 mo term, perks: none.
--   2. Creator: Rs 15,000/yr, 15% individual, 7% bundle, 7 bookings/mo, 2 rentals, 1 user, Rs 0 default credit, 12 mo term, perks: none.
--   3. Cinematographer: Rs 35,000/yr, 20% individual, 10% bundle, 10 bookings/mo, 3 rentals, 2 users, Rs 1,00,000 default credit, 12 mo term, perks: none.
--   4. Production Alliance: Rs 80,000/yr, 20% individual, 12% bundle, 20 bookings/mo, 7 rentals, 5 users, Rs 2,50,000 default credit, 12 mo term, perks: Priority Booking, Dedicated Manager, Company Billing, Credit Terms.
--   5. Elite: Custom fee (NULL), 20% individual, Custom bundle (NULL), Unlimited bookings (NULL), Unlimited rentals (NULL), Unlimited users (NULL), Rs 5,00,000 default credit, 12 mo term, perks: Dedicated Manager, VIP Support, Custom Solutions, Company Billing, Credit Terms.
--
-- Invariants:
--   - Hard discount cap <= 25% (0005 check: membership_plans_discount_hard_cap).
--   - Display order is 1 to 5.
--   - Column masking on membership_plans_v preserves Law 6 money-blindness.
--   - Idempotent: ON CONFLICT (level) DO UPDATE.
-- =============================================================================

begin;

insert into public.membership_plans (
  client_uuid,
  level,
  label,
  annual_fee,
  individual_discount_pct,
  bundle_discount_pct,
  monthly_booking_limit,
  simultaneous_rental_limit,
  authorized_users,
  default_credit_limit,
  term_months,
  perks,
  display_order,
  status
) values
  (
    '11111111-0000-0000-0000-000000000001'::uuid,
    'Academy',
    'Access Member',
    6000.00,
    10,
    5,
    3,
    1,
    1,
    0.00,
    12,
    '{}'::membership_perk[],
    1,
    'Active'
  ),
  (
    '11111111-0000-0000-0000-000000000002'::uuid,
    'Creator',
    'Access Member',
    15000.00,
    15,
    7,
    7,
    2,
    1,
    0.00,
    12,
    '{}'::membership_perk[],
    2,
    'Active'
  ),
  (
    '11111111-0000-0000-0000-000000000003'::uuid,
    'Cinematographer',
    'Access Member',
    35000.00,
    20,
    10,
    10,
    3,
    2,
    100000.00,
    12,
    '{}'::membership_perk[],
    3,
    'Active'
  ),
  (
    '11111111-0000-0000-0000-000000000004'::uuid,
    'Production Alliance',
    'Partner',
    80000.00,
    20,
    12,
    20,
    7,
    5,
    250000.00,
    12,
    '{"Priority Booking","Dedicated Manager","Company Billing","Credit Terms"}'::membership_perk[],
    4,
    'Active'
  ),
  (
    '11111111-0000-0000-0000-000000000005'::uuid,
    'Elite',
    'Elite Member',
    null,
    20,
    null,
    null,
    null,
    null,
    500000.00,
    12,
    '{"Dedicated Manager","VIP Support","Custom Solutions","Company Billing","Credit Terms"}'::membership_perk[],
    5,
    'Active'
  )
on conflict (level) do update set
  label = excluded.label,
  annual_fee = excluded.annual_fee,
  individual_discount_pct = excluded.individual_discount_pct,
  bundle_discount_pct = excluded.bundle_discount_pct,
  monthly_booking_limit = excluded.monthly_booking_limit,
  simultaneous_rental_limit = excluded.simultaneous_rental_limit,
  authorized_users = excluded.authorized_users,
  default_credit_limit = excluded.default_credit_limit,
  term_months = excluded.term_months,
  perks = excluded.perks,
  display_order = excluded.display_order,
  status = excluded.status,
  updated_at = now();

commit;
