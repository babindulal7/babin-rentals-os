# Accountant Questions: O-14 and O-17

**Date:** 2026-11-01  
**Status:** Pending response  
**Blocking:** T3-14c (Number on settlement)  
**Related:** T3-05 (IRD e-billing check)

---

## English Version

### Question 1: O-14 — Numbered Invoice That Later Changes

A rental invoice is fully paid and numbered. Afterwards the client:
- Extends the rental by two days
- Returns equipment late
- Damages equipment

**Options:**
- **(A) Second invoice** — Issue a second invoice for the difference (additional days, late fees, damage charges)
- **(B) Credit note + new invoice** — Issue a credit note against the original invoice, then issue a corrected invoice with the final amount

**Current behavior:** Software blocks any change and shows a message: *"An issued invoice's lines are immutable — correct it with a credit note."* This is a technical guard, not a business decision.

**Decision needed:** Which approach should be the standard workflow?

---

### Question 2: O-17 — VAT Timing (When Must the Tax Invoice Be Numbered?)

**Legal basis:** VAT Act 2052 §6 sets the time of supply at the earliest of:
1. Invoice date
2. Service completion (handover/return)
3. Payment receipt

With separate rules for part payments (advances).

**Question:** May the tax invoice be numbered **only when the rental is fully paid** (current T3-14b design: draft at Confirm, numbered on full payment)?

Or does any of these trigger an immediate numbering requirement:
- **Advance payment received** (first payment)
- **Handover/equipment delivery** (service commencement)

**Impact on T3-14c design:**
- If "full payment only" → current design stands (draft at Confirm, number on full payment)
- If "first payment" → trigger numbering on first payment received
- If "handover" → trigger numbering at handover (Packed→On Rent transition)

**Decision needed:** Which event triggers the VAT invoice number?

---

### Related: T3-05 — IRD E-Billing Compliance

Separate from O-14/O-17: We need to confirm whether our invoice format, numbering scheme, and data fields meet IRD (Inland Revenue Department) e-billing requirements for your client's turnover bracket.

---

## नेपाली संस्करण (Nepali Version)

### प्रश्न १: O-14 — नम्बर लागिसकेको बिजक पछि परिवर्तन हुँदा

भाडाको बिजक पूरा भुक्तानी भई नम्बर लागिसकेको छ। पछि ग्राहकले:
- दुई दिन थप्नुभयो (भाडा थप)
- ढिलो फर्काउनुभयो (ढिलो फर्काउने)
- सामानमा क्षति भयो (क्षति)

**विकल्पहरू:**
- **(क) दोस्रो बिजक** — फरक रकमको दोस्रो बिजक काट्ने
- **(ख) क्रेडिट नोट + नयाँ बिजक** — पहिलो बिजकमा **क्रेडिट नोट (credit note)** काटेर नयाँ सच्याइएको बिजक काट्ने

**हालको व्यवहार:** सफ्टवेयरले परिवर्तन रोकेर सन्देश देखाउँछ — *"An issued invoice's lines are immutable — correct it with a credit note."* यो तकनिकी गार्ड हो, व्यावसायिक निर्णय होइन।

**निर्णय चाहिन्छ:** कुन तरिका मानक कार्यविधि (standard workflow) हुनुपर्छ?

---

### प्रश्न २: O-17 — भ्याट समय (VAT Timing) — बिजक कहिले नम्बर गर्नुपर्ने?

**कानुनी आधार:** भ्याट ऐन २०५२ को दफा ६ अनुसार आपूर्तिको समय (time of supply) निम्नमध्ये जुन पहिले हुन्छ त्यो:
१. बिजकको मिति (Invoice date)
२. सेवा समाप्ति (हस्तान्तरण/फर्काउने)
३. भुक्तानी प्राप्ति (Payment receipt)

आंशिक भुक्तानी (advance/part payment) को छुट्टै नियम छ।

**प्रश्न:** के कर बिजक **भाडाको पूरा भुक्तानी भएपछि मात्र नम्बर गर्न मिल्छ** (हालको T3-14b डिजाइन: Confirm मा Draft, पूरा भुक्तानीमा नम्बर)?

वा यी घटनाहरूमा पहिले नै नम्बर अनिवार्य हुन्छ:
- **अग्रिम भुक्तानी (Advance/first payment)** प्राप्त भएपछि
- **हस्तान्तरण/सामान हस्तान्तरण (Handover)** भएपछि (सेवा सुरु भएपछि)

**T3-14c डिजाइनमा असर:**
- "पूरा भुक्तानी मात्र" भने → हालको डिजाइन ठीक (Confirm मा Draft, पूरा भुक्तानीमा नम्बर)
- "पहिलो भुक्तानी" भने → पहिलो भुक्तानी प्राप्त भएपछि नम्बर
- "हस्तान्तरण" भने → हस्तान्तरणमा नम्बर (Packed → On Rent संक्रमणमा)

**निर्णय चाहिन्छ:** कुन घटनाले भ्याट बिजक नम्बर ट्रिगर गर्ने?

---

### सम्बन्धित: T3-05 — IRD E-Billing अनुपालन (Compliance)

O-14/O-17 बाट फरक विषय: हाम्रो बिजकको ढाँचा, नम्बरिङ स्कीम, र डेटा फिल्डहरू IRD (Inland Revenue Department) को e-billing आवश्यकताहरूअनुसार छन् कि छैनन्, यस बाबत पुष्टि गर्न बाँकी छ (ग्राहकको कारोबार/turnover bracket अनुसार)।

---

## Action Items

- [ ] Send to accountant (email/meeting)
- [ ] Record response in `docs/OPEN_DECISIONS.md` (O-14, O-17)
- [ ] Update `PLAN.md` §4.2 with decisions
- [ ] Proceed with T3-14c implementation once answers received
- [ ] Coordinate T3-05 IRD check separately with accountant

---

**Prepared by:** AI Assistant  
**Date:** 2026-11-01  
**For:** Babin Rentals OS — Accountant Review