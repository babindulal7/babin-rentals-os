# Browser regression cases — 21 October 2026

Use the existing local mock preview. Do not submit a booking or restore/discard the existing draft. These supplement the automated dashboard/calendar/overflow/header suites; they do not certify physical devices or hosted behavior.

## Booking header at 360 × 800

1. Open `/rentals?action=new` in a separate temporary tab and set the viewport to 360 × 800.
2. Wait for **More rental actions**, **Confirm Booking**, **Rental summary**, **Search** and **user profile** to render.
3. Run this read-only assertion through the browser's documented `playwright.evaluate` API:

```js
() => {
  const buttons = [...document.querySelectorAll('header button')]
    .filter(button => button.getBoundingClientRect().width > 0)
    .map(button => ({ name: button.getAttribute('aria-label') ?? button.textContent?.trim(),
      rect: button.getBoundingClientRect().toJSON() }))
  for (const name of ['More rental actions', 'Confirm Booking', 'Rental summary', 'Search', 'user profile']) {
    if (!buttons.some(button => button.name?.includes(name))) throw new Error(`Missing action: ${name}`)
  }
  if (buttons.some(({rect}) => rect.width < 44 || rect.height < 44 || rect.left < 0 || rect.right > innerWidth)) {
    throw new Error('A header action is too small or clipped')
  }
  return { width: innerWidth, buttons }
}
```

Before: profile ended at 366px in a 360px viewport. After the phone-spacing correction: five 44 × 44px buttons fit, with the profile ending at 348px. See `fixed-regressions.json` and `new-rental-fixed-360-after.jpg`.

## Calendar footer Today

1. Open `/today` at 1440 × 900. Record pickup/return heading rectangles and the **Today · Overdue included** label.
2. Open **Today — choose master dispatch date** and activate the calendar's footer **Today**, separately from its quick-preset row.
3. Assert the calendar closes, the quick Today preset stays selected, the overdue label remains, and both heading rectangles are unchanged.
4. Repeat for pickup-only and return-only calendars; only the selected panel's filter may change. These panel boundaries and the before-06:00 case are also covered in `dashboardLayout.test.tsx`.

The recorded desktop browser comparison passed with identical rectangles. See `today-fixed-footer-desktop.jpg`.

## Catalogue clearance

At 360 × 800, open **Browse catalogue** without adding an item. Assert the **Add item to booking** dialog's left/right edges fit the viewport and its bottom is above the bottom **Main** navigation. Recorded: dialog bottom 729.79px; navigation top 742px. See `catalogue-fixed-360.jpg`.

Restore viewport overrides and close only temporary verification tabs. If the browser attachment fails, record incomplete cleanup instead of claiming it succeeded. Settled tablet Today layout, physical devices, offline behavior and complete workflows remain separate acceptance work.
