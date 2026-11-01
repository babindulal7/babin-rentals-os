# T6-01 — Nepali glossary: review sheet

**Status:** draft for Babin · **Drafted:** 1 Nov 2026 · **Terms:** 265 · **Target approval:** 6 Dec 2026 (20 Mangsir 2083)

The source of truth is [`src/i18n/glossary.ne.json`](../../src/i18n/glossary.ne.json). This sheet is generated from it — change the JSON, not this file.

## How to approve (one sitting, about 30 minutes)

1. **Start with the 7 flagged rows below.** Each has a real choice. Reply with the row id and the word you want.
2. Skim the rest. Reply with any id you want changed; say nothing about the ones you accept.
3. Reply **"approved"** (or "approved except …"). The `approved` date is then set on every accepted term and nothing else ships until it is.

Existing words from `src/lib/i18n.ts` (15 keys, already verified) were kept exactly as they are.

## Flagged — please decide

| Id | English | Draft | Alternative | Question |
|---|---|---|---|---|
| `stage.dispatched` | Dispatched | पठाइएको | — | Is "पठाइएको" clear on a pickup (no courier) booking? |
| `verb.reset` | Reset | पुनः तयार | रिसेट | Floor staff may say "रिसेट" aloud. Pick one; the screen must match. |
| `verb.resetVerb` | Reset gear | पुनः तयार गर्नुहोस् | — | Same decision as Reset. |
| `money.advance` | Advance | पेशकी | अग्रिम | पेशकी (everyday) or अग्रिम (formal)? |
| `money.deposit` | Deposit | धरौटी | जमानत | धरौटी or जमानत for security deposit? |
| `delivery.trip` | Trip | यात्रा | फेरो | यात्रा or फेरो for a driver's trip? |
| `condition.missing` | Missing | हराइरहेको | — | हराइरहेको vs हराएको (Lost) — close in sound; confirm the difference reads clearly. |

## All terms

### Navigation — the eleven destinations

Order is the sidebar order. Four rows already ship in src/lib/i18n.ts and are kept word for word.

| Id | English | Nepali | Note |
|---|---|---|---|
| `nav.newRental` | New Rental | नयाँ भाडा |  |
| `nav.today` | Today | आज | Already in i18n.ts. |
| `nav.operations` | Operations | सञ्चालन | The floor queues (Pack, Handover, Return, Reset). |
| `nav.rentals` | Rentals | भाडा | Already in i18n.ts. |
| `nav.calendar` | Calendar | पात्रो | पात्रो is the Nepali calendar specifically — right for a BS-first screen. |
| `nav.crewAssist` | Crew Assist | क्रु सहायता *(alt: दल सहायता)* | क्रु is how film people say it in Kathmandu. |
| `nav.inventory` | Inventory | मौज्दात | Stock on hand. Already in i18n.ts. |
| `nav.clients` | Clients | ग्राहक | Law 15 forbids "customer" in English; ग्राहक covers both in Nepali. Already in i18n.ts. |
| `nav.finance` | Finance | वित्त | Already in i18n.ts. |
| `nav.tools` | Tools | औजार | Not उपकरण — that word is Equipment. |
| `nav.settings` | Settings | सेटिङ | Already in i18n.ts. |
| `nav.more` | More | थप | Phone bottom-bar slot. |
| `nav.scan` | Scan | स्क्यान | Phone bottom-bar centre slot. |

### Booking stages

All 13 values of the booking_stage enum, plus the three words staff use that are not stages (Booked, Returned, Overdue).

| Id | English | Nepali | Note |
|---|---|---|---|
| `stage.quote` | Quote | कोटेसन *(alt: मूल्य प्रस्ताव)* | The word every Nepali supplier already uses. |
| `stage.draft` | Draft | मस्यौदा | Already in i18n.ts. |
| `stage.confirmed` | Confirmed | पुष्टि भएको |  |
| `stage.preparing` | Preparing | तयारीमा |  |
| `stage.ready` | Ready | तयार |  |
| `stage.dispatched` | Dispatched | पठाइएको | Left the warehouse, not yet with the client. |
| `stage.onRent` | On Rent | भाडामा | Already in i18n.ts. |
| `stage.returnDue` | Return Due | फिर्ता हुनुपर्ने |  |
| `stage.inspection` | Inspection | जाँच |  |
| `stage.cleaning` | Cleaning | सफाइ |  |
| `stage.completed` | Completed | सम्पन्न |  |
| `stage.closed` | Closed | बन्द | Terminal state of a finished booking. |
| `stage.cancelled` | Cancelled | रद्द भएको |  |
| `stage.booked` | Booked | बुक भएको | Already in i18n.ts. |
| `stage.returned` | Returned | फिर्ता भयो | Already in i18n.ts. |
| `stage.overdue` | Overdue | म्याद नाघेको | Already in i18n.ts. Also used for invoices. |

### Status colour families

The six stage_category values (always shown with text, never colour alone — Law 11).

| Id | English | Nepali | Note |
|---|---|---|---|
| `category.neutral` | Neutral | सामान्य |  |
| `category.actionRequired` | Action Required | कारबाही आवश्यक |  |
| `category.inProgress` | In Progress | प्रक्रियामा |  |
| `category.waiting` | Waiting | प्रतीक्षामा |  |
| `category.success` | Success | सफल |  |
| `category.danger` | Danger | जोखिम |  |

### Floor verbs and workspaces

Pack · Handover · Return · Reset are the four verbs; Evidence is the photo step. Buttons use the polite imperative, headings use the noun.

| Id | English | Nepali | Note |
|---|---|---|---|
| `verb.pack` | Pack | प्याक गर्नुहोस् | Button. |
| `verb.packNoun` | Packing | प्याकिङ | Workspace heading. |
| `verb.handover` | Handover | हस्तान्तरण | Heading. Button: हस्तान्तरण गर्नुहोस्. |
| `verb.handoverVerb` | Hand over | हस्तान्तरण गर्नुहोस् | Button. |
| `verb.return` | Return | फिर्ता | Heading. |
| `verb.returnVerb` | Receive return | फिर्ता लिनुहोस् | Button. Not the same as the status फिर्ता भयो. |
| `verb.reset` | Reset | पुनः तयार *(alt: रिसेट)* | Heading — clean, test, restock. |
| `verb.resetVerb` | Reset gear | पुनः तयार गर्नुहोस् | Button. |
| `verb.evidence` | Evidence | प्रमाण | The photo step. |
| `verb.scanEquipment` | Scan equipment | उपकरण स्क्यान गर्नुहोस् |  |
| `verb.takePhoto` | Take photo | फोटो खिच्नुहोस् |  |
| `verb.checklist` | Checklist | जाँचसूची | What the app calls a "gate" is shown to staff as the checklist. |
| `verb.stockCheck` | Stock Check | मौज्दात जाँच |  |
| `verb.queue` | Queue | पङ्क्ति | Operations queue. |

### Checklist blockers (gate names)

The reasons a floor step is refused. Written as the problem, so staff know what to fix. Warehouse sees no amount next to "payment required" — Law 6.

| Id | English | Nepali | Note |
|---|---|---|---|
| `gate.paymentRequired` | Payment required | भुक्तानी आवश्यक |  |
| `gate.agreementUnsigned` | Agreement not signed | सम्झौतामा हस्ताक्षर बाँकी |  |
| `gate.receiverUnverified` | Receiver not verified | प्राप्तकर्ता प्रमाणित भएको छैन |  |
| `gate.unitsUnassigned` | Units not assigned | एकाइ तोकिएको छैन |  |
| `gate.unitsUnpacked` | Units not packed | एकाइ प्याक भएको छैन |  |
| `gate.unitsUnhanded` | Units not handed over | एकाइ हस्तान्तरण भएको छैन |  |
| `gate.unitsUnaccounted` | Units not accounted for | एकाइको हिसाब मिलेको छैन |  |
| `gate.damagePending` | Damage decision pending | क्षतिको निर्णय बाँकी |  |
| `gate.depositUnresolved` | Deposit not settled | धरौटी टुङ्गिएको छैन |  |
| `gate.invoiceUnsettled` | Invoice not settled | बिल चुक्ता भएको छैन |  |
| `gate.openCase` | Open case | खुला केस |  |
| `gate.reasonRequired` | Reason required | कारण आवश्यक छ |  |

### Roles

The nine roles in PERMISSIONS §2.

| Id | English | Nepali | Note |
|---|---|---|---|
| `role.owner` | Owner | मालिक |  |
| `role.admin` | Admin | प्रशासक |  |
| `role.manager` | Manager | व्यवस्थापक |  |
| `role.coordinator` | Coordinator | समन्वयकर्ता |  |
| `role.warehouse` | Warehouse | गोदाम | Role label; the place is the same word. |
| `role.technician` | Technician | प्राविधिक |  |
| `role.accounts` | Accounts | लेखा |  |
| `role.driver` | Driver | चालक |  |
| `role.client` | Client | ग्राहक |  |
| `role.staff` | Staff | कर्मचारी |  |

### Money words

Amounts stay Latin: "NPR 12,500" is never written in Devanagari digits. Only the words around the figure translate.

| Id | English | Nepali | Note |
|---|---|---|---|
| `money.rentalTotal` | Rental Total | भाडा जम्मा |  |
| `money.advance` | Advance | पेशकी *(alt: अग्रिम)* | Paid before the rental starts. |
| `money.deposit` | Deposit | धरौटी *(alt: जमानत)* | A liability held for the client — never part of Rental Total or Outstanding. |
| `money.outstanding` | Outstanding | बाँकी | What the client still owes on the rental. |
| `money.balance` | Balance | बाँकी रकम |  |
| `money.payment` | Payment | भुक्तानी |  |
| `money.recordPayment` | Record payment | भुक्तानी दर्ता गर्नुहोस् |  |
| `money.paid` | Paid | चुक्ता | Invoice status. |
| `money.unpaid` | Unpaid | भुक्तानी बाँकी |  |
| `money.partiallyPaid` | Partially Paid | आंशिक भुक्तानी |  |
| `money.invoice` | Invoice | बिल |  |
| `money.receipt` | Receipt | रसिद |  |
| `money.refund` | Refund | रकम फिर्ता | A payment going back to the client. |
| `money.release` | Release | फिर्ता दिइएको | Deposit released to the client — a different thing from a refund. |
| `money.applied` | Applied | समायोजन गरिएको | Deposit applied against a charge. |
| `money.discount` | Discount | छुट |  |
| `money.vat` | VAT | भ्याट | Long form: मूल्य अभिवृद्धि कर. |
| `money.subtotal` | Subtotal | उप-जम्मा |  |
| `money.total` | Total | जम्मा |  |
| `money.amount` | Amount | रकम |  |
| `money.rate` | Rate | दर |  |
| `money.dailyRate` | Daily rate | दैनिक दर |  |
| `money.lateFee` | Late fee | ढिलाइ शुल्क |  |
| `money.damageCharge` | Damage charge | क्षति शुल्क |  |
| `money.creditNote` | Credit note | क्रेडिट नोट |  |
| `money.void` | Void | खारेज | Invoice status — cancelled with a reason, never deleted. |
| `money.reversal` | Reversal | भुक्तानी उल्टाइएको | Payments are never edited; a reversal row corrects them. |
| `money.expense` | Expense | खर्च |  |
| `money.payout` | Payout | भुक्तानी दिइएको | Crew payout. |
| `money.tds` | TDS | टीडीएस |  |
| `money.pan` | PAN | प्यान |  |
| `money.requiredAdvance` | Advance required | पेशकी चाहिने |  |

### Invoice and payment states

invoice_status and payment_status enums.

| Id | English | Nepali | Note |
|---|---|---|---|
| `invoice.sent` | Sent | पठाइएको |  |
| `invoice.received` | Received | प्राप्त |  |
| `invoice.refunded` | Refunded | फिर्ता गरिएको |  |
| `invoice.failed` | Failed | असफल |  |
| `invoice.depositRequired` | Deposit required | धरौटी आवश्यक |  |
| `invoice.depositPending` | Deposit pending | धरौटी बाँकी |  |

### Payment channels

Brand names never translate — they are listed so nobody tries.

| Id | English | Nepali | Note |
|---|---|---|---|
| `payMethod.cash` | Cash | नगद |  |
| `payMethod.bank` | Bank | बैंक |  |
| `payMethod.wallet` | Digital wallets | डिजिटल वालेट |  |
| `payMethod.cards` | Cards | कार्ड |  |
| `payMethod.cheque` | Cheque | चेक |  |
| `payMethod.other` | Other | अन्य |  |
| `payMethod.fonepay` | Fonepay | Fonepay | Brand — stays Latin. |
| `payMethod.esewa` | eSewa | eSewa | Brand — stays Latin. |
| `payMethod.khalti` | Khalti | Khalti | Brand — stays Latin. |

### Buttons and verbs

Full polite imperative, never a transliterated English verb. The first three ship today in i18n.ts.

| Id | English | Nepali | Note |
|---|---|---|---|
| `action.save` | Save | सुरक्षित गर्नुहोस् | Already in i18n.ts. |
| `action.cancel` | Cancel | रद्द गर्नुहोस् | Already in i18n.ts. Dismisses a dialog; booking cancellation uses the same word with its own confirmation. |
| `action.edit` | Edit | सम्पादन गर्नुहोस् | Already in i18n.ts. |
| `action.confirm` | Confirm | पुष्टि गर्नुहोस् |  |
| `action.back` | Back | पछाडि |  |
| `action.next` | Next | अर्को |  |
| `action.retry` | Try again | फेरि प्रयास गर्नुहोस् |  |
| `action.add` | Add | थप्नुहोस् |  |
| `action.remove` | Remove | हटाउनुहोस् | Takes a line off a form. Nothing in the app deletes a record. |
| `action.close` | Close | बन्द गर्नुहोस् | Closes a dialog, or closes a booking. |
| `action.reopen` | Reopen | पुनः खोल्नुहोस् |  |
| `action.create` | Create | सिर्जना गर्नुहोस् |  |
| `action.view` | View | हेर्नुहोस् |  |
| `action.search` | Search | खोज्नुहोस् |  |
| `action.filter` | Filter | फिल्टर |  |
| `action.clear` | Clear | खाली गर्नुहोस् |  |
| `action.apply` | Apply | लागू गर्नुहोस् |  |
| `action.send` | Send | पठाउनुहोस् |  |
| `action.print` | Print | छाप्नुहोस् |  |
| `action.download` | Download | डाउनलोड गर्नुहोस् |  |
| `action.upload` | Upload | अपलोड गर्नुहोस् |  |
| `action.export` | Export | निर्यात गर्नुहोस् |  |
| `action.import` | Import | आयात गर्नुहोस् |  |
| `action.share` | Share | साझा गर्नुहोस् |  |
| `action.refresh` | Refresh | ताजा गर्नुहोस् |  |
| `action.signIn` | Sign in | साइन इन गर्नुहोस् *(alt: लगइन गर्नुहोस्)* |  |
| `action.signOut` | Sign out | साइन आउट गर्नुहोस् *(alt: लगआउट गर्नुहोस्)* |  |
| `action.done` | Done | भयो |  |
| `action.submit` | Submit | बुझाउनुहोस् |  |
| `action.addNote` | Add note | टिप्पणी थप्नुहोस् |  |
| `action.assign` | Assign | तोक्नुहोस् |  |
| `action.cancelBooking` | Cancel booking | बुकिङ रद्द गर्नुहोस् |  |
| `action.markAsPaid` | Mark as paid | चुक्ता भएको जनाउनुहोस् |  |

### Core nouns

The words that appear on almost every screen.

| Id | English | Nepali | Note |
|---|---|---|---|
| `noun.booking` | Booking | बुकिङ |  |
| `noun.rental` | Rental | भाडा |  |
| `noun.equipment` | Equipment | उपकरण |  |
| `noun.product` | Product | सामग्री |  |
| `noun.bundle` | Bundle | बन्डल |  |
| `noun.accessory` | Accessory | सहायक सामग्री |  |
| `noun.unit` | Unit | एकाइ | One physical item with its own serial number. |
| `noun.serialNumber` | Serial number | सिरियल नम्बर |  |
| `noun.category` | Category | वर्ग |  |
| `noun.quantity` | Quantity | मात्रा |  |
| `noun.item` | Item | वस्तु |  |
| `noun.note` | Note | टिप्पणी |  |
| `noun.reason` | Reason | कारण |  |
| `noun.status` | Status | अवस्था |  |
| `noun.stage` | Stage | चरण |  |
| `noun.branch` | Branch | शाखा |  |
| `noun.location` | Location | स्थान |  |
| `noun.crew` | Crew | क्रु |  |
| `noun.company` | Company | कम्पनी |  |
| `noun.client1` | Client | ग्राहक | Singular. |
| `noun.name` | Name | नाम |  |
| `noun.phone` | Phone | फोन |  |
| `noun.email` | Email | इमेल |  |
| `noun.address` | Address | ठेगाना |  |
| `noun.receiver` | Receiver | प्राप्तकर्ता | The person who takes the gear at handover. |
| `noun.agreement` | Agreement | सम्झौता |  |
| `noun.document` | Document | कागजात |  |
| `noun.photo` | Photo | फोटो |  |
| `noun.idDocument` | ID document | परिचयपत्र |  |
| `noun.report` | Report | प्रतिवेदन |  |
| `noun.membership` | Membership | सदस्यता |  |
| `noun.subRental` | Sub-Rental | उप-भाडा | Gear hired in from another supplier to fill a booking. |
| `noun.services` | Services | सेवा |  |
| `noun.crewCharges` | Crew charges | क्रु शुल्क |  |
| `noun.transport` | Transport | यातायात |  |

### Delivery and pickup

delivery_method enum. The database value says "Customer Pickup"; the screen must say client.

| Id | English | Nepali | Note |
|---|---|---|---|
| `delivery.clientPickup` | Client pickup | ग्राहक आफैं लिने |  |
| `delivery.babinDelivery` | Babin delivery | बबिनबाट ढुवानी |  |
| `delivery.courier` | Courier | कुरियर |  |
| `delivery.thirdParty` | Third party | तेस्रो पक्ष |  |
| `delivery.delivery` | Delivery | ढुवानी |  |
| `delivery.pickup` | Pickup | लिने |  |
| `delivery.trip` | Trip | यात्रा *(alt: फेरो)* |  |

### Condition, cases and maintenance

unit_condition, case_type, case_status and damage_disposition.

| Id | English | Nepali | Note |
|---|---|---|---|
| `condition.excellent` | Excellent | उत्कृष्ट |  |
| `condition.good` | Good | राम्रो |  |
| `condition.fair` | Fair | मध्यम |  |
| `condition.damaged` | Damaged | क्षतिग्रस्त |  |
| `condition.lost` | Lost | हराएको |  |
| `condition.damage` | Damage | क्षति |  |
| `condition.missing` | Missing | हराइरहेको | A unit not returned and not yet declared lost. |
| `condition.theft` | Theft | चोरी |  |
| `condition.dispute` | Dispute | विवाद |  |
| `condition.vendor` | Vendor | आपूर्तिकर्ता |  |
| `condition.case` | Case | केस |  |
| `condition.open` | Open | खुला |  |
| `condition.underReview` | Under Review | समीक्षामा |  |
| `condition.awaitingDecision` | Awaiting Decision | निर्णयको प्रतीक्षामा |  |
| `condition.resolved` | Resolved | समाधान भएको |  |
| `condition.chargeClient` | Charge client | ग्राहकलाई शुल्क लगाउने |  |
| `condition.absorb` | Absorb | आफैं बेहोर्ने |  |
| `condition.deferInsurance` | Defer to insurance | बीमामा पठाउने |  |
| `condition.maintenance` | Maintenance | मर्मत |  |

### Date and time words

Digits stay Latin (lib/bs.ts test). Month and weekday names are Devanagari in the Nepali view.

| Id | English | Nepali | Note |
|---|---|---|---|
| `date.date` | Date | मिति |  |
| `date.time` | Time | समय |  |
| `date.startDate` | Start date | सुरु मिति |  |
| `date.returnDate` | Return date | फिर्ता मिति |  |
| `date.duration` | Duration | अवधि |  |
| `date.day` | Day | दिन |  |
| `date.week` | Week | हप्ता |  |
| `date.month` | Month | महिना |  |
| `date.tomorrow` | Tomorrow | भोलि |  |
| `date.yesterday` | Yesterday | हिजो |  |
| `date.bs` | BS | वि.सं. | Bikram Sambat. Leads in the Nepali view. |
| `date.ad` | AD | ई.सं. |  |
| `date.bsMonth1` | Baisakh | बैशाख | BS month 1. |
| `date.bsMonth2` | Jestha | जेठ | BS month 2. |
| `date.bsMonth3` | Ashadh | असार | BS month 3. |
| `date.bsMonth4` | Shrawan | श्रावण | BS month 4. |
| `date.bsMonth5` | Bhadra | भदौ | BS month 5. |
| `date.bsMonth6` | Ashwin | असोज | BS month 6. |
| `date.bsMonth7` | Kartik | कार्तिक | BS month 7. |
| `date.bsMonth8` | Mangsir | मंसिर | BS month 8. |
| `date.bsMonth9` | Poush | पौष | BS month 9. |
| `date.bsMonth10` | Magh | माघ | BS month 10. |
| `date.bsMonth11` | Falgun | फागुन | BS month 11. |
| `date.bsMonth12` | Chaitra | चैत | BS month 12. |
| `date.weekday0` | Sunday | आइतबार |  |
| `date.weekday1` | Monday | सोमबार |  |
| `date.weekday2` | Tuesday | मङ्गलबार |  |
| `date.weekday3` | Wednesday | बुधबार |  |
| `date.weekday4` | Thursday | बिहीबार |  |
| `date.weekday5` | Friday | शुक्रबार |  |
| `date.weekday6` | Saturday | शनिबार |  |

### Errors, warnings and system words

Errors sit inline beside the field; toasts are for successes only (Law 12). Wording says what happened and what to do.

| Id | English | Nepali | Note |
|---|---|---|---|
| `msg.error` | Error | त्रुटि |  |
| `msg.warning` | Warning | चेतावनी |  |
| `msg.saved` | Saved | सुरक्षित भयो | Only ever shown after the server confirmed the write. |
| `msg.somethingWrong` | Something went wrong | केही गडबड भयो |  |
| `msg.notAllowed` | You are not allowed to do this | तपाईंलाई यो गर्ने अनुमति छैन |  |
| `msg.notFound` | Not found | फेला परेन |  |
| `msg.noResults` | No results | कुनै नतिजा छैन |  |
| `msg.required` | This field is required | यो खाली छोड्न मिल्दैन |  |
| `msg.invalid` | Invalid | अमान्य |  |
| `msg.alreadyExists` | Already exists | पहिले नै छ |  |
| `msg.loading` | Loading | लोड हुँदैछ |  |
| `msg.offline` | Offline | अफलाइन |  |
| `msg.syncing` | Syncing | सिङ्क हुँदैछ |  |
| `msg.notSaved` | Not saved | सुरक्षित भएन | Shown when a write failed or is still queued — never a "saved" claim. |
| `msg.unsaved` | Unsaved changes | सुरक्षित नगरिएको परिवर्तन |  |
| `msg.pending` | Pending | बाँकी |  |
| `msg.blocked` | Blocked | रोकिएको |  |
| `msg.yes` | Yes | हो |  |
| `msg.no` | No | होइन |  |
| `msg.all` | All | सबै |  |
| `msg.none` | None | कुनै छैन |  |
| `msg.language` | Language | भाषा |  |

## Never translated

- Numbers and date digits (Latin in both languages, lib/bs.ts test)
- NPR and every amount: "NPR 12,500"
- Booking numbers (B-715), invoice numbers, serials (SN-FX3-102), SKUs
- Brand names: Fonepay, eSewa, Khalti, Babin Rentals
- The language name itself: नेपाली / English

## Style rules

- Buttons: full polite imperative (-नुहोस्). Headings and labels: noun form.
- Never "सेभ"-style transliteration where a real Nepali word exists. Everyday trade words already used on the floor (कोटेसन, क्रु, भ्याट, प्यान) are kept.
- The English word "customer" never appears; the Nepali ग्राहक stands for client.
- Never bold Devanagari headings (Asar has one weight; see safeWeight in i18n.ts).
