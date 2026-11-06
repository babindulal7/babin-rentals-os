-- RULING 2026-11-05 C-6: Owner only; approved glossary changes apply immediately.
-- Renumbered from branch-local 0222 at integration. Restore wording by adding a revision.
-- Babin explicitly authorized live application on 6 Nov 2026, after backup and verification.
begin;

create table public.glossary_terms (
  id uuid primary key default gen_random_uuid(),
  term_key text not null unique,
  english text not null,
  original_nepali text not null,
  approved_at date not null
);

-- Approved 1 Nov source glossary. Generated from the existing approved file, not new translations.
insert into public.glossary_terms(term_key,english,original_nepali,approved_at) values
('nav.newRental', 'New Rental', 'नयाँ भाडा', '2026-11-01'),
('nav.today', 'Today', 'आज', '2026-11-01'),
('nav.operations', 'Operations', 'सञ्चालन', '2026-11-01'),
('nav.rentals', 'Rentals', 'भाडा', '2026-11-01'),
('nav.calendar', 'Calendar', 'पात्रो', '2026-11-01'),
('nav.crewAssist', 'Crew Assist', 'क्रु सहायता', '2026-11-01'),
('nav.inventory', 'Inventory', 'मौज्दात', '2026-11-01'),
('nav.clients', 'Clients', 'ग्राहक', '2026-11-01'),
('nav.finance', 'Finance', 'वित्त', '2026-11-01'),
('nav.tools', 'Tools', 'औजार', '2026-11-01'),
('nav.settings', 'Settings', 'सेटिङ', '2026-11-01'),
('nav.more', 'More', 'थप', '2026-11-01'),
('nav.scan', 'Scan', 'स्क्यान', '2026-11-01'),
('stage.quote', 'Quote', 'कोटेसन', '2026-11-01'),
('stage.draft', 'Draft', 'मस्यौदा', '2026-11-01'),
('stage.confirmed', 'Confirmed', 'पुष्टि भएको', '2026-11-01'),
('stage.preparing', 'Preparing', 'तयारीमा', '2026-11-01'),
('stage.ready', 'Ready', 'तयार', '2026-11-01'),
('stage.dispatched', 'Dispatched', 'पठाइएको', '2026-11-01'),
('stage.onRent', 'On Rent', 'भाडामा', '2026-11-01'),
('stage.returnDue', 'Return Due', 'फिर्ता हुनुपर्ने', '2026-11-01'),
('stage.inspection', 'Inspection', 'जाँच', '2026-11-01'),
('stage.cleaning', 'Cleaning', 'सफाइ', '2026-11-01'),
('stage.completed', 'Completed', 'सम्पन्न', '2026-11-01'),
('stage.closed', 'Closed', 'बन्द', '2026-11-01'),
('stage.cancelled', 'Cancelled', 'रद्द भएको', '2026-11-01'),
('stage.booked', 'Booked', 'बुक भएको', '2026-11-01'),
('stage.returned', 'Returned', 'फिर्ता भयो', '2026-11-01'),
('stage.overdue', 'Overdue', 'म्याद नाघेको', '2026-11-01'),
('category.neutral', 'Neutral', 'सामान्य', '2026-11-01'),
('category.actionRequired', 'Action Required', 'कारबाही आवश्यक', '2026-11-01'),
('category.inProgress', 'In Progress', 'प्रक्रियामा', '2026-11-01'),
('category.waiting', 'Waiting', 'प्रतीक्षामा', '2026-11-01'),
('category.success', 'Success', 'सफल', '2026-11-01'),
('category.danger', 'Danger', 'जोखिम', '2026-11-01'),
('verb.pack', 'Pack', 'प्याक गर्नुहोस्', '2026-11-01'),
('verb.packNoun', 'Packing', 'प्याकिङ', '2026-11-01'),
('verb.handover', 'Handover', 'हस्तान्तरण', '2026-11-01'),
('verb.handoverVerb', 'Hand over', 'हस्तान्तरण गर्नुहोस्', '2026-11-01'),
('verb.return', 'Return', 'फिर्ता', '2026-11-01'),
('verb.returnVerb', 'Receive return', 'फिर्ता लिनुहोस्', '2026-11-01'),
('verb.reset', 'Reset', 'पुनः तयार', '2026-11-01'),
('verb.resetVerb', 'Reset gear', 'पुनः तयार गर्नुहोस्', '2026-11-01'),
('verb.evidence', 'Evidence', 'प्रमाण', '2026-11-01'),
('verb.scanEquipment', 'Scan equipment', 'उपकरण स्क्यान गर्नुहोस्', '2026-11-01'),
('verb.takePhoto', 'Take photo', 'फोटो खिच्नुहोस्', '2026-11-01'),
('verb.checklist', 'Checklist', 'जाँचसूची', '2026-11-01'),
('verb.stockCheck', 'Stock Check', 'मौज्दात जाँच', '2026-11-01'),
('verb.queue', 'Queue', 'पङ्क्ति', '2026-11-01'),
('gate.paymentRequired', 'Payment required', 'भुक्तानी आवश्यक', '2026-11-01'),
('gate.agreementUnsigned', 'Agreement not signed', 'सम्झौतामा हस्ताक्षर बाँकी', '2026-11-01'),
('gate.receiverUnverified', 'Receiver not verified', 'प्राप्तकर्ता प्रमाणित भएको छैन', '2026-11-01'),
('gate.unitsUnassigned', 'Units not assigned', 'एकाइ तोकिएको छैन', '2026-11-01'),
('gate.unitsUnpacked', 'Units not packed', 'एकाइ प्याक भएको छैन', '2026-11-01'),
('gate.unitsUnhanded', 'Units not handed over', 'एकाइ हस्तान्तरण भएको छैन', '2026-11-01'),
('gate.unitsUnaccounted', 'Units not accounted for', 'एकाइको हिसाब मिलेको छैन', '2026-11-01'),
('gate.damagePending', 'Damage decision pending', 'क्षतिको निर्णय बाँकी', '2026-11-01'),
('gate.depositUnresolved', 'Deposit not settled', 'धरौटी टुङ्गिएको छैन', '2026-11-01'),
('gate.invoiceUnsettled', 'Invoice not settled', 'बिल चुक्ता भएको छैन', '2026-11-01'),
('gate.openCase', 'Open case', 'खुला केस', '2026-11-01'),
('gate.reasonRequired', 'Reason required', 'कारण आवश्यक छ', '2026-11-01'),
('role.owner', 'Owner', 'मालिक', '2026-11-01'),
('role.admin', 'Admin', 'प्रशासक', '2026-11-01'),
('role.manager', 'Manager', 'व्यवस्थापक', '2026-11-01'),
('role.coordinator', 'Coordinator', 'समन्वयकर्ता', '2026-11-01'),
('role.warehouse', 'Warehouse', 'गोदाम', '2026-11-01'),
('role.technician', 'Technician', 'प्राविधिक', '2026-11-01'),
('role.accounts', 'Accounts', 'लेखा', '2026-11-01'),
('role.driver', 'Driver', 'चालक', '2026-11-01'),
('role.client', 'Client', 'ग्राहक', '2026-11-01'),
('role.staff', 'Staff', 'कर्मचारी', '2026-11-01'),
('money.rentalTotal', 'Rental Total', 'भाडा जम्मा', '2026-11-01'),
('money.advance', 'Advance', 'पेशकी', '2026-11-01'),
('money.deposit', 'Deposit', 'धरौटी', '2026-11-01'),
('money.outstanding', 'Outstanding', 'बाँकी', '2026-11-01'),
('money.balance', 'Balance', 'बाँकी रकम', '2026-11-01'),
('money.payment', 'Payment', 'भुक्तानी', '2026-11-01'),
('money.recordPayment', 'Record payment', 'भुक्तानी दर्ता गर्नुहोस्', '2026-11-01'),
('money.paid', 'Paid', 'चुक्ता', '2026-11-01'),
('money.unpaid', 'Unpaid', 'भुक्तानी बाँकी', '2026-11-01'),
('money.partiallyPaid', 'Partially Paid', 'आंशिक भुक्तानी', '2026-11-01'),
('money.invoice', 'Invoice', 'बिल', '2026-11-01'),
('money.receipt', 'Receipt', 'रसिद', '2026-11-01'),
('money.refund', 'Refund', 'रकम फिर्ता', '2026-11-01'),
('money.release', 'Release', 'फिर्ता दिइएको', '2026-11-01'),
('money.applied', 'Applied', 'समायोजन गरिएको', '2026-11-01'),
('money.discount', 'Discount', 'छुट', '2026-11-01'),
('money.vat', 'VAT', 'भ्याट', '2026-11-01'),
('money.subtotal', 'Subtotal', 'उप-जम्मा', '2026-11-01'),
('money.total', 'Total', 'जम्मा', '2026-11-01'),
('money.amount', 'Amount', 'रकम', '2026-11-01'),
('money.rate', 'Rate', 'दर', '2026-11-01'),
('money.dailyRate', 'Daily rate', 'दैनिक दर', '2026-11-01'),
('money.lateFee', 'Late fee', 'ढिलाइ शुल्क', '2026-11-01'),
('money.damageCharge', 'Damage charge', 'क्षति शुल्क', '2026-11-01'),
('money.creditNote', 'Credit note', 'क्रेडिट नोट', '2026-11-01'),
('money.void', 'Void', 'खारेज', '2026-11-01'),
('money.reversal', 'Reversal', 'भुक्तानी उल्टाइएको', '2026-11-01'),
('money.expense', 'Expense', 'खर्च', '2026-11-01'),
('money.payout', 'Payout', 'भुक्तानी दिइएको', '2026-11-01'),
('money.tds', 'TDS', 'टीडीएस', '2026-11-01'),
('money.pan', 'PAN', 'प्यान', '2026-11-01'),
('money.requiredAdvance', 'Advance required', 'पेशकी चाहिने', '2026-11-01'),
('invoice.sent', 'Sent', 'पठाइएको', '2026-11-01'),
('invoice.received', 'Received', 'प्राप्त', '2026-11-01'),
('invoice.refunded', 'Refunded', 'फिर्ता गरिएको', '2026-11-01'),
('invoice.failed', 'Failed', 'असफल', '2026-11-01'),
('invoice.depositRequired', 'Deposit required', 'धरौटी आवश्यक', '2026-11-01'),
('invoice.depositPending', 'Deposit pending', 'धरौटी बाँकी', '2026-11-01'),
('payMethod.cash', 'Cash', 'नगद', '2026-11-01'),
('payMethod.bank', 'Bank', 'बैंक', '2026-11-01'),
('payMethod.wallet', 'Digital wallets', 'डिजिटल वालेट', '2026-11-01'),
('payMethod.cards', 'Cards', 'कार्ड', '2026-11-01'),
('payMethod.cheque', 'Cheque', 'चेक', '2026-11-01'),
('payMethod.other', 'Other', 'अन्य', '2026-11-01'),
('payMethod.fonepay', 'Fonepay', 'Fonepay', '2026-11-01'),
('payMethod.esewa', 'eSewa', 'eSewa', '2026-11-01'),
('payMethod.khalti', 'Khalti', 'Khalti', '2026-11-01'),
('action.save', 'Save', 'सुरक्षित गर्नुहोस्', '2026-11-01'),
('action.cancel', 'Cancel', 'रद्द गर्नुहोस्', '2026-11-01'),
('action.edit', 'Edit', 'सम्पादन गर्नुहोस्', '2026-11-01'),
('action.confirm', 'Confirm', 'पुष्टि गर्नुहोस्', '2026-11-01'),
('action.back', 'Back', 'पछाडि', '2026-11-01'),
('action.next', 'Next', 'अर्को', '2026-11-01'),
('action.retry', 'Try again', 'फेरि प्रयास गर्नुहोस्', '2026-11-01'),
('action.add', 'Add', 'थप्नुहोस्', '2026-11-01'),
('action.remove', 'Remove', 'हटाउनुहोस्', '2026-11-01'),
('action.close', 'Close', 'बन्द गर्नुहोस्', '2026-11-01'),
('action.reopen', 'Reopen', 'पुनः खोल्नुहोस्', '2026-11-01'),
('action.create', 'Create', 'सिर्जना गर्नुहोस्', '2026-11-01'),
('action.view', 'View', 'हेर्नुहोस्', '2026-11-01'),
('action.search', 'Search', 'खोज्नुहोस्', '2026-11-01'),
('action.filter', 'Filter', 'फिल्टर', '2026-11-01'),
('action.clear', 'Clear', 'खाली गर्नुहोस्', '2026-11-01'),
('action.apply', 'Apply', 'लागू गर्नुहोस्', '2026-11-01'),
('action.send', 'Send', 'पठाउनुहोस्', '2026-11-01'),
('action.print', 'Print', 'छाप्नुहोस्', '2026-11-01'),
('action.download', 'Download', 'डाउनलोड गर्नुहोस्', '2026-11-01'),
('action.upload', 'Upload', 'अपलोड गर्नुहोस्', '2026-11-01'),
('action.export', 'Export', 'निर्यात गर्नुहोस्', '2026-11-01'),
('action.import', 'Import', 'आयात गर्नुहोस्', '2026-11-01'),
('action.share', 'Share', 'साझा गर्नुहोस्', '2026-11-01'),
('action.refresh', 'Refresh', 'ताजा गर्नुहोस्', '2026-11-01'),
('action.signIn', 'Sign in', 'साइन इन गर्नुहोस्', '2026-11-01'),
('action.signOut', 'Sign out', 'साइन आउट गर्नुहोस्', '2026-11-01'),
('action.done', 'Done', 'भयो', '2026-11-01'),
('action.submit', 'Submit', 'बुझाउनुहोस्', '2026-11-01'),
('action.addNote', 'Add note', 'टिप्पणी थप्नुहोस्', '2026-11-01'),
('action.assign', 'Assign', 'तोक्नुहोस्', '2026-11-01'),
('action.cancelBooking', 'Cancel booking', 'बुकिङ रद्द गर्नुहोस्', '2026-11-01'),
('action.markAsPaid', 'Mark as paid', 'चुक्ता भएको जनाउनुहोस्', '2026-11-01'),
('noun.booking', 'Booking', 'बुकिङ', '2026-11-01'),
('noun.rental', 'Rental', 'भाडा', '2026-11-01'),
('noun.equipment', 'Equipment', 'उपकरण', '2026-11-01'),
('noun.product', 'Product', 'सामग्री', '2026-11-01'),
('noun.bundle', 'Bundle', 'बन्डल', '2026-11-01'),
('noun.accessory', 'Accessory', 'सहायक सामग्री', '2026-11-01'),
('noun.unit', 'Unit', 'एकाइ', '2026-11-01'),
('noun.serialNumber', 'Serial number', 'सिरियल नम्बर', '2026-11-01'),
('noun.category', 'Category', 'वर्ग', '2026-11-01'),
('noun.quantity', 'Quantity', 'मात्रा', '2026-11-01'),
('noun.item', 'Item', 'वस्तु', '2026-11-01'),
('noun.note', 'Note', 'टिप्पणी', '2026-11-01'),
('noun.reason', 'Reason', 'कारण', '2026-11-01'),
('noun.status', 'Status', 'अवस्था', '2026-11-01'),
('noun.stage', 'Stage', 'चरण', '2026-11-01'),
('noun.branch', 'Branch', 'शाखा', '2026-11-01'),
('noun.location', 'Location', 'स्थान', '2026-11-01'),
('noun.crew', 'Crew', 'क्रु', '2026-11-01'),
('noun.company', 'Company', 'कम्पनी', '2026-11-01'),
('noun.client1', 'Client', 'ग्राहक', '2026-11-01'),
('noun.name', 'Name', 'नाम', '2026-11-01'),
('noun.phone', 'Phone', 'फोन', '2026-11-01'),
('noun.email', 'Email', 'इमेल', '2026-11-01'),
('noun.address', 'Address', 'ठेगाना', '2026-11-01'),
('noun.receiver', 'Receiver', 'प्राप्तकर्ता', '2026-11-01'),
('noun.agreement', 'Agreement', 'सम्झौता', '2026-11-01'),
('noun.document', 'Document', 'कागजात', '2026-11-01'),
('noun.photo', 'Photo', 'फोटो', '2026-11-01'),
('noun.idDocument', 'ID document', 'परिचयपत्र', '2026-11-01'),
('noun.report', 'Report', 'प्रतिवेदन', '2026-11-01'),
('noun.membership', 'Membership', 'सदस्यता', '2026-11-01'),
('noun.subRental', 'Sub-Rental', 'उप-भाडा', '2026-11-01'),
('noun.services', 'Services', 'सेवा', '2026-11-01'),
('noun.crewCharges', 'Crew charges', 'क्रु शुल्क', '2026-11-01'),
('noun.transport', 'Transport', 'यातायात', '2026-11-01'),
('delivery.clientPickup', 'Client pickup', 'ग्राहक आफैं लिने', '2026-11-01'),
('delivery.babinDelivery', 'Babin delivery', 'बबिनबाट ढुवानी', '2026-11-01'),
('delivery.courier', 'Courier', 'कुरियर', '2026-11-01'),
('delivery.thirdParty', 'Third party', 'तेस्रो पक्ष', '2026-11-01'),
('delivery.delivery', 'Delivery', 'ढुवानी', '2026-11-01'),
('delivery.pickup', 'Pickup', 'लिने', '2026-11-01'),
('delivery.trip', 'Trip', 'यात्रा', '2026-11-01'),
('condition.excellent', 'Excellent', 'उत्कृष्ट', '2026-11-01'),
('condition.good', 'Good', 'राम्रो', '2026-11-01'),
('condition.fair', 'Fair', 'मध्यम', '2026-11-01'),
('condition.damaged', 'Damaged', 'क्षतिग्रस्त', '2026-11-01'),
('condition.lost', 'Lost', 'हराएको', '2026-11-01'),
('condition.damage', 'Damage', 'क्षति', '2026-11-01'),
('condition.missing', 'Missing', 'हराइरहेको', '2026-11-01'),
('condition.theft', 'Theft', 'चोरी', '2026-11-01'),
('condition.dispute', 'Dispute', 'विवाद', '2026-11-01'),
('condition.vendor', 'Vendor', 'आपूर्तिकर्ता', '2026-11-01'),
('condition.case', 'Case', 'केस', '2026-11-01'),
('condition.open', 'Open', 'खुला', '2026-11-01'),
('condition.underReview', 'Under Review', 'समीक्षामा', '2026-11-01'),
('condition.awaitingDecision', 'Awaiting Decision', 'निर्णयको प्रतीक्षामा', '2026-11-01'),
('condition.resolved', 'Resolved', 'समाधान भएको', '2026-11-01'),
('condition.chargeClient', 'Charge client', 'ग्राहकलाई शुल्क लगाउने', '2026-11-01'),
('condition.absorb', 'Absorb', 'आफैं बेहोर्ने', '2026-11-01'),
('condition.deferInsurance', 'Defer to insurance', 'बीमामा पठाउने', '2026-11-01'),
('condition.maintenance', 'Maintenance', 'मर्मत', '2026-11-01'),
('date.date', 'Date', 'मिति', '2026-11-01'),
('date.time', 'Time', 'समय', '2026-11-01'),
('date.startDate', 'Start date', 'सुरु मिति', '2026-11-01'),
('date.returnDate', 'Return date', 'फिर्ता मिति', '2026-11-01'),
('date.duration', 'Duration', 'अवधि', '2026-11-01'),
('date.day', 'Day', 'दिन', '2026-11-01'),
('date.week', 'Week', 'हप्ता', '2026-11-01'),
('date.month', 'Month', 'महिना', '2026-11-01'),
('date.tomorrow', 'Tomorrow', 'भोलि', '2026-11-01'),
('date.yesterday', 'Yesterday', 'हिजो', '2026-11-01'),
('date.bs', 'BS', 'वि.सं.', '2026-11-01'),
('date.ad', 'AD', 'ई.सं.', '2026-11-01'),
('date.bsMonth1', 'Baisakh', 'बैशाख', '2026-11-01'),
('date.bsMonth2', 'Jestha', 'जेठ', '2026-11-01'),
('date.bsMonth3', 'Ashadh', 'असार', '2026-11-01'),
('date.bsMonth4', 'Shrawan', 'श्रावण', '2026-11-01'),
('date.bsMonth5', 'Bhadra', 'भदौ', '2026-11-01'),
('date.bsMonth6', 'Ashwin', 'असोज', '2026-11-01'),
('date.bsMonth7', 'Kartik', 'कार्तिक', '2026-11-01'),
('date.bsMonth8', 'Mangsir', 'मंसिर', '2026-11-01'),
('date.bsMonth9', 'Poush', 'पौष', '2026-11-01'),
('date.bsMonth10', 'Magh', 'माघ', '2026-11-01'),
('date.bsMonth11', 'Falgun', 'फागुन', '2026-11-01'),
('date.bsMonth12', 'Chaitra', 'चैत', '2026-11-01'),
('date.weekday0', 'Sunday', 'आइतबार', '2026-11-01'),
('date.weekday1', 'Monday', 'सोमबार', '2026-11-01'),
('date.weekday2', 'Tuesday', 'मङ्गलबार', '2026-11-01'),
('date.weekday3', 'Wednesday', 'बुधबार', '2026-11-01'),
('date.weekday4', 'Thursday', 'बिहीबार', '2026-11-01'),
('date.weekday5', 'Friday', 'शुक्रबार', '2026-11-01'),
('date.weekday6', 'Saturday', 'शनिबार', '2026-11-01'),
('msg.error', 'Error', 'त्रुटि', '2026-11-01'),
('msg.warning', 'Warning', 'चेतावनी', '2026-11-01'),
('msg.saved', 'Saved', 'सुरक्षित भयो', '2026-11-01'),
('msg.somethingWrong', 'Something went wrong', 'केही गडबड भयो', '2026-11-01'),
('msg.notAllowed', 'You are not allowed to do this', 'तपाईंलाई यो गर्ने अनुमति छैन', '2026-11-01'),
('msg.notFound', 'Not found', 'फेला परेन', '2026-11-01'),
('msg.noResults', 'No results', 'कुनै नतिजा छैन', '2026-11-01'),
('msg.required', 'This field is required', 'यो खाली छोड्न मिल्दैन', '2026-11-01'),
('msg.invalid', 'Invalid', 'अमान्य', '2026-11-01'),
('msg.alreadyExists', 'Already exists', 'पहिले नै छ', '2026-11-01'),
('msg.loading', 'Loading', 'लोड हुँदैछ', '2026-11-01'),
('msg.offline', 'Offline', 'अफलाइन', '2026-11-01'),
('msg.syncing', 'Syncing', 'सिङ्क हुँदैछ', '2026-11-01'),
('msg.notSaved', 'Not saved', 'सुरक्षित भएन', '2026-11-01'),
('msg.unsaved', 'Unsaved changes', 'सुरक्षित नगरिएको परिवर्तन', '2026-11-01'),
('msg.pending', 'Pending', 'विचाराधीन', '2026-11-01'),
('msg.blocked', 'Blocked', 'रोकिएको', '2026-11-01'),
('msg.yes', 'Yes', 'हो', '2026-11-01'),
('msg.no', 'No', 'होइन', '2026-11-01'),
('msg.all', 'All', 'सबै', '2026-11-01'),
('msg.none', 'None', 'कुनै छैन', '2026-11-01'),
('msg.language', 'Language', 'भाषा', '2026-11-01');

create table public.glossary_term_revisions (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique,
  revision bigint generated always as identity unique check (revision <= 9007199254740991),
  term_key text not null references public.glossary_terms(term_key),
  original_nepali text not null,
  nepali text not null check (length(btrim(nepali)) between 1 and 300 and nepali !~ '[०-९]'),
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);
create index glossary_term_revisions_original_idx on public.glossary_term_revisions(original_nepali, revision desc);

alter table public.glossary_terms enable row level security;
alter table public.glossary_term_revisions enable row level security;
revoke all on public.glossary_terms, public.glossary_term_revisions from public, anon, authenticated;
revoke all on sequence public.glossary_term_revisions_revision_seq from public, anon, authenticated;
grant select on public.glossary_terms, public.glossary_term_revisions to authenticated;
create policy glossary_terms_staff on public.glossary_terms for select to authenticated using (public.auth_is_staff());
create policy glossary_revisions_staff on public.glossary_term_revisions for select to authenticated using (public.auth_is_staff());

create trigger glossary_terms_immutable before update on public.glossary_terms
  for each row execute function public.reject_update_append_only('canonical glossary terms change only through a reviewed migration');
create trigger glossary_terms_no_delete before delete on public.glossary_terms
  for each row execute function public.reject_delete_nothing_is_deleted('glossary history is retained');
create trigger glossary_revisions_immutable before update on public.glossary_term_revisions
  for each row execute function public.reject_update_append_only('approve the previous wording as another revision');
create trigger glossary_revisions_no_delete before delete on public.glossary_term_revisions
  for each row execute function public.reject_delete_nothing_is_deleted('approve the previous wording as another revision');

create function public.audit_glossary_revision() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.audit_events (client_uuid,event_class,category,module,action,severity,status,table_name,record_id,actor_id,new_values)
  values (gen_random_uuid(),'status change','Administration','Settings','Approve','Informational','Success',
    'glossary_term_revisions',NEW.id,NEW.created_by,to_jsonb(NEW));
  return NEW;
end;
$$;
revoke all on function public.audit_glossary_revision() from public, anon, authenticated;
create trigger glossary_revision_audit after insert on public.glossary_term_revisions
  for each row execute function public.audit_glossary_revision();

create function public.approve_glossary_term(p_client_uuid uuid, p_term_key text, p_nepali text, p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_term public.glossary_terms%rowtype;
  v_revision public.glossary_term_revisions%rowtype;
  v_current bigint;
begin
  if public.auth_user_role() is distinct from 'Owner'::public.system_role or public.auth_user_id() is null then
    raise exception 'GATE:glossary.role|Only the Owner may approve glossary changes.' using errcode = '42501';
  end if;
  if p_client_uuid is null then raise exception 'GATE:glossary.uuid|A retry key is required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_client_uuid::text,0));
  select * into v_revision from public.glossary_term_revisions where client_uuid = p_client_uuid;
  if found then
    if v_revision.term_key is distinct from p_term_key or v_revision.nepali is distinct from btrim(p_nepali) then
      raise exception 'GATE:glossary.idempotency|This retry key belongs to another glossary change.';
    end if;
    return to_jsonb(v_revision);
  end if;
  select * into v_term from public.glossary_terms where term_key = p_term_key;
  if not found then raise exception 'GATE:glossary.term|Choose an existing glossary term.'; end if;
  if p_nepali is null or length(btrim(p_nepali)) not between 1 and 300 or p_nepali ~ '[०-९]' then
    raise exception 'GATE:glossary.text|Enter 1 to 300 characters and keep numbers in Latin digits.';
  end if;
  if array(select m[1] from regexp_matches(p_nepali,'(\{[^}]+\})','g') m order by 1)
    is distinct from array(select m[1] from regexp_matches(v_term.original_nepali,'(\{[^}]+\})','g') m order by 1)
    or regexp_replace(p_nepali,'\{[^}]+\}','','g') ~ '[{}]' then
    raise exception 'GATE:glossary.placeholders|Keep original placeholders unchanged.';
  end if;
  if array(select m[1] from regexp_matches(p_nepali,'([A-Za-z0-9]+([._-][A-Za-z0-9]+)*)','g') m order by 1)
    is distinct from array(select m[1] from regexp_matches(v_term.original_nepali,'([A-Za-z0-9]+([._-][A-Za-z0-9]+)*)','g') m order by 1) then
    raise exception 'GATE:glossary.latin|Keep original Latin numbers, brands and identifiers unchanged.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('glossary:' || v_term.original_nepali,0));
  select coalesce(max(revision),0) into v_current from public.glossary_term_revisions where original_nepali = v_term.original_nepali;
  if p_expected_revision is null or p_expected_revision <> v_current then
    raise exception 'GATE:glossary.changed|The term changed while you were editing. Reload before approving.';
  end if;
  insert into public.glossary_term_revisions(client_uuid,term_key,original_nepali,nepali,created_by)
  values (p_client_uuid,v_term.term_key,v_term.original_nepali,btrim(p_nepali),public.auth_user_id()) returning * into v_revision;
  return to_jsonb(v_revision);
end;
$$;
revoke all on function public.approve_glossary_term(uuid,text,text,bigint) from public, anon;
grant execute on function public.approve_glossary_term(uuid,text,text,bigint) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'glossary_term_revisions') then
    alter publication supabase_realtime add table public.glossary_term_revisions;
  end if;
end $$;
commit;
