# Babin Rentals OS — Staff Training Modules & Bilingual Quick Sheets (T9-07)

**Audience:** Floor (Warehouse & Technician), Desk (Rental Coordinator & Manager), Accounts (Accountant & Admin)  
**Languages:** English & Nepali (नेपाली)  
**Status:** Verification & Training Protocol for Trial Readiness  

---

## Session 1: Floor Operations (Packing, Handover, Return, Inspection, Reset)
**भूमिका (Roles):** Warehouse, Technician  
**Core Principles:** 
- Barcode/QR scanning and manual search are 100% equivalent alternatives.
- Real camera evidence for damages/collateral.
- Technician/Warehouse are strictly money-blind (no prices or payment amounts visible).

### Practice Tasks (Floor)
1. **Task F1 (Pack):** Locate booking `BK-MOCK-001`, open packing list, scan or manually check 3 serialised lenses, verify all green checkmarks.
2. **Task F2 (Missing item):** Mark 1 consumable item as unavailable/pending, observe red gate blocking Handover.
3. **Task F3 (Handover & Collateral):** Capture client signature, take photo of physical Citizenship/ID card collateral, mark Handover completed.
4. **Task F4 (Return & Damage Flag):** Receive returned gear, inspect sensor, report scratch on front element with photo, open damage incident.
5. **Task F5 (Reset & QC):** Perform cleaning and reset QC checklist on returned unit, return status to Available.

---

### Quick Sheet: Floor Operations (English)
| Step | Action | Method (Barcode or Manual) | Success Check |
|---|---|---|---|
| **1. Pack** | Verify assigned gear | Scan QR or type serial number | Checkmark turns green; no missing gear |
| **2. Handover** | Client release | Sign on screen + capture ID photo | Stage transitions to `Handover Complete` |
| **3. Return** | Inward check | Inspect serials & physical condition | Flag damage immediately if scratched/broken |
| **4. Damage** | Evidence capture | Take minimum 1 clear photo + notes | Case logged; unit moves to Inspection |
| **5. Reset** | QC & restock | Complete checklist; restock shelf | Status returns to `Available` |

### Quick Sheet: फ्लोर अपरेसन (नेपाली)
| चरण | कार्य | तरिका (बारकोड वा म्यानुअल) | सफलता जाँच |
|---|---|---|---|
| **१. प्याकिङ** | सामान रुजु गर्ने | QR स्क्यान गर्ने वा सिरियल नम्बर खोज्ने | हरियो चिन्ह आउँछ; कुनै सामान छुट्दैन |
| **२. ह्यान्डओभर** | ग्राहकलाई हस्तान्तरण | स्क्रिनमा हस्ताक्षर + परिचयपत्र फोटो | स्थिति `ह्यान्डओभर सम्पन्न` हुन्छ |
| **३. फिर्ता** | फिर्ता सामान जाँच | सिरियल नम्बर र सामानको अवस्था जाँच | सामान बिग्रिएको भए तत्काल जानकारी दर्ता |
| **४. क्षति प्रमाण** | फोटो प्रमाण | कम्तीमा १ स्पष्ट फोटो + विवरण | केस दर्ता हुन्छ; सामान निरीक्षणमा जान्छ |
| **५. रिसेट/QC** | सफाइ र स्टोर फिर्ता | चेकलिस्ट पूरा गर्ने; र्‍याकमा राख्ने | सामान पुन: `उपलब्ध` स्थितिमा आउँछ |

---

## Session 2: Desk Operations (New Rental, Availability, Booking Confirmation)
**भूमिका (Roles):** Rental Coordinator, Manager  
**Core Principles:**
- Availability check is fail-closed across Kathmandu 06:00 to 06:00 operational days.
- Overlapping bookings or Booqable external holds block confirmation.
- Online guest requests must be reviewed and accepted/declined explicitly.

### Practice Tasks (Desk)
1. **Task D1 (New Rental):** Create booking for client `Aarav Films`, pick dates 20–22 Nov 2026, add Sony FX3 kit.
2. **Task D2 (Conflict Check):** Attempt to double-book FX3 unit on 21 Nov, verify system rejects with clash warning.
3. **Task D3 (Online Request Review):** Open online booking queue, inspect guest inquiry, confirm valid client identity.
4. **Task D4 (Deposit Verification):** Record security deposit as liability (verifying it does not reduce Outstanding).
5. **Task D5 (Handoff to Floor):** Confirm booking and transition stage to `Confirmed - Ready for Pack`.

---

### Quick Sheet: Desk Operations (English)
- **Check Availability:** Run query before promising gear to client.
- **Deposit != Rental Total:** Deposit is held as security; never deduct from invoice total.
- **Client Identity:** Verify verified phone number and VAT/PAN if corporate.

### Quick Sheet: डेस्क अपरेसन (नेपाली)
- **उपलब्धता जाँच:** ग्राहकलाई सामान पक्का गर्नुअघि प्रणालीमा मिति अनुसार मौज्दात हेर्ने।
- **धरौटी (Deposit) भाडा होइन:** धरौटी सुरक्षाको लागि मात्र हो; यसलाई कुल भाडा रकमबाट घटाउन पाइँदैन।
- **ग्राहक विवरण:** ग्राहकको फोन नम्बर, ठेगाना र कम्पनी भए पान/भ्याट प्रमाणित गर्ने।

---

## Session 3: Accounts Operations (Invoicing, Payments, VAT, TDS, Daily Closing)
**भूमिका (Roles):** Accountant, Admin, Owner  
**Core Principles:**
- Integer paisa arithmetic; no fractional rupees.
- Payments are append-only; corrections require reversal entries (never edit or delete).
- VAT 13% and TDS withholding correctly accounted and exported for IRD.

### Practice Tasks (Accounts)
1. **Task A1 (Issue Invoice):** Generate tax invoice from confirmed booking with correct IRD sequential number.
2. **Task A2 (Record Payment):** Record bank transfer / Fonepay payment with reference transaction ID.
3. **Task A3 (Payment Correction):** Issue reversal entry for wrong amount and re-enter correct receipt.
4. **Task A4 (Daily Closing):** Reconcile daily cash, bank receipts, and deposits at 18:00 NPT.
5. **Task A5 (TDS Register):** Export monthly TDS deductions report for corporate client settlements.

---

### Quick Sheet: Accounts Operations (English)
- **Invoices:** Monotonic sequence numbers (INV-XXXXX); immutable once issued.
- **Receipts:** Reversals only for corrections; no row editing.
- **Daily Closing:** Must balance cash drawer + digital payments before day ends.

### Quick Sheet: लेखा/एकाउन्ट्स अपरेसन (नेपाली)
- **बिलिङ (Invoicing):** क्रमिक इनभ्वाइस नम्बर (INV-XXXXX); जारी भएपछि फेरबदल गर्न पाइँदैन।
- **भुक्तानी रसिद:** गल्ती भएमा संशोधन (Reversal) प्रविष्टि गर्ने; पुरानो मेटाउन पाइँदैन।
- **दैनिक क्लोजिङ:** दिनको अन्त्यमा नगद र डिजिटल भुक्तानीको हिसाब मिलान अनिवार्य गर्ने।

---

## Attendance & Device Sign-in Log (Template)
*(Store no real credentials or phone numbers in repository)*

| Staff Identifier | Assigned Role | Device Type (Desktop/iPad/Phone) | Session Attended (F / D / A) | Practice Tasks Passed | Date (BS / AD) |
|---|---|---|---|---|---|
| `STAFF-01` | Warehouse | Mobile Phone (Android) | Session 1 | 5 / 5 | 2083-08-02 |
| `STAFF-02` | Technician | iPad 10.2" | Session 1 | 5 / 5 | 2083-08-02 |
| `STAFF-03` | Coordinator | Desktop PC | Session 2 | 5 / 5 | 2083-08-02 |
| `STAFF-04` | Accountant | Desktop PC | Session 3 | 5 / 5 | 2083-08-02 |

---

## 3-Device Usability & Ergonomics Feedback Form
1. **Desktop (1440px):** Fast navigation, keyboard shortcut accessibility, clear table hierarchies.
2. **Tablet / iPad (820px):** Comfortable two-handed operation, touch target >= 44px, no modal overflow.
3. **Mobile Phone (375px):** One-handed thumb reach for floor verbs (Pack, Scan, Handover >= 56px), legible Nepali typography (Asar/Hind), offline queue sync resilience.
