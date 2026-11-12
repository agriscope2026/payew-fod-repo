/** User Guide content: tutorials, FAQ and glossary. Plain text; "\n" starts a new paragraph. */

export interface Tutorial {
  id: string
  title: string
  summary: string
  /** Numbered steps. */
  steps: string[]
  tips?: string[]
  /** In-app page this tutorial is about. */
  link?: { to: string; label: string }
}

export const TUTORIALS: Tutorial[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    summary: 'Sign in, pick your fiscal year and program, and find your way around.',
    steps: [
      'Sign in with the email and temporary password from your administrator. You will be asked to set your own password the first time.',
      'Use the Fiscal year and Program selectors in the top bar. Almost every page — Dashboard, Finance, Activities (Physical), Calendar, Reports — follows them.',
      'Program staff and admins see their own programs; the superadmin can also choose "All programs".',
      'Press Ctrl+K (or click the search box) to jump to any activity, package, supplier, beneficiary or page.',
      'Open Profile from the menu at the top right to update your name, position, contact number and photo.',
    ],
    tips: [
      'The bell shows notifications; mute the types you don’t need under Notifications → Preferences. Directives, overdue notices and escalations always arrive.',
      'My Tasks lists everything waiting on you in one place.',
    ],
    link: { to: '/dashboard', label: 'Open the Dashboard' },
  },
  {
    id: 'planning',
    title: 'The WFP: the main sheet you type in',
    summary:
      'Finance sheets work like Excel. The WFP is where you encode; the other pages fill themselves from it.',
    steps: [
      'Go to Finance → WFP. The sheet starts from the DA-CAR template: Phase/Component, Activity, Sub-activity, Unit of Measure, Annual Target, Object of Expenditure, Annual Budget, obligation and disbursement columns, Status and Remarks.',
      'Click a cell and type, as in Excel. Double-click a cell to place the cursor inside it; long text opens in a box that grows so you can read all of it. Formulas start with “=”.',
      'Use the open button at the start of a row to see the whole row as a form and edit every column at once.',
      'Pick the Status from its dropdown. To change the choices, select the column and use Dropdown in the toolbar.',
      'Click Save. Numbering and lettering of phases, activities and sub-activities are put in order for you, and the linked pages are updated: Activities (Physical), the ORS and DV registers, the PPMP and the APP.',
      'The Σ row pinned at the bottom shows the column totals while you scroll. Use the arrows beside a phase to collapse or expand its activities, or Outline in the toolbar to do it for the whole sheet.',
    ],
    tips: [
      'A row counts as an activity when it has an activity title and a unit of measure.',
      '“Linked sheets” in the toolbar shows which pages the WFP feeds and lets you update them again.',
      'The orange scrollbar and its arrows show there is more to the right or below.',
      'History keeps the last 30 saved versions, and can start over from the template.',
    ],
    link: { to: '/finance', label: 'Open Finance' },
  },
  {
    id: 'sheet-views',
    title: 'Sheet, Cards and Document views',
    summary: 'Three ways to look at the same finance sheet.',
    steps: [
      'Use the Sheet | Cards | Document switch beside the sheet’s name.',
      'Sheet is the Excel-like grid with the formatting toolbar: number formats, bold and colours, alignment, merge, borders, rows and columns, freeze, and clean-up tools.',
      'Cards shows one card per activity in the WFP (budget, obligated, disbursed, balance) and one card per row in the other sheets. Click a card to edit the whole row, then Save.',
      'Document is a read-only page with the DA-CAR letterhead for reading and printing. Use “Print or save as PDF”.',
    ],
    link: { to: '/finance', label: 'Open Finance' },
  },
  {
    id: 'upload-export',
    title: 'Uploading and exporting sheets',
    summary:
      'Bring in an Excel file or Google Sheet that follows the template, and export a presentable workbook.',
    steps: [
      'In a finance sheet click Upload, then choose an .xlsx file or paste a Google Sheets link. Download the template from the same dialog if you need a copy.',
      'The upload is accepted only when its columns match the template. The dialog tells you what does not match.',
      'An accepted upload opens as a draft. Clean it up — remove empty rows, fix formats — then click Finalize to replace the current sheet, or Discard draft.',
      'Export downloads an .xlsx with the DA-CAR logo, title, colours and totals, ready to present.',
    ],
    link: { to: '/finance', label: 'Open Finance' },
  },
  {
    id: 'activities',
    title: 'Activities (Physical) and their workflow',
    summary:
      'Monthly and quarterly physical targets and accomplishments, with each activity’s workflow and status.',
    steps: [
      'Activities come from the WFP. “New activity” takes you to the WFP: add a row with the activity and its unit of measure, then save.',
      'The chart at the top compares cumulative targets with accomplishments by month. Below it, activities are grouped by phase with their monthly and quarterly figures.',
      'Switch between Targets and Accomplished, and between Table and Cards.',
      'Click an activity to open it: enter monthly targets and accomplishments, and see its budget, obligated and disbursed amounts from the WFP.',
      'On the activity’s Workflow tab, Start and Complete each stage. Missing details or documents only show a warning — you can still complete the stage.',
      'Set the Status on the Workflow tab. It is the same Status as in the WFP, so changing it in either place changes both, and the dashboard graphs it.',
    ],
    tips: [
      'An activity removed from the WFP stays here marked “Not in WFP”, so its records are not lost.',
      'Staff need “can edit activities” on their account to change activities.',
    ],
    link: { to: '/activities', label: 'Open Activities (Physical)' },
  },
  {
    id: 'packages',
    title: 'Working with multiple suppliers (procurement packages)',
    summary:
      'Split an activity into packages — lodging, meals, supplies… — each with its own supplier, workflow and money.',
    steps: [
      'Open the activity → Packages tab → Add package. Pick a template (Lodging, Meals, Transportation, Supplies/Materials, Venue, Printing, Equipment, Honoraria/Services, Other) to pre-fill the category and expense class.',
      'Enter the ABC (Approved Budget for the Contract). The sum of package ABCs should stay within the activity budget.',
      'Each package runs its own steps in parallel: Specifications → PR → Solicitation (RFQ/SVP/bidding) → Evaluation → Award (NOA/PO) → Delivery → Inspection → ORS → DV → Closed. Packages never wait for each other.',
      'Award the package to a supplier. Blacklisted suppliers are blocked; suspended ones and expired PhilGEPS/permits show a warning. Savings (ABC − contract) are suggested automatically.',
      'Choose when the package is obligated: after delivery & inspection (default) or at award, before delivery. You can switch until the first delivery.',
      'Record deliveries (partial deliveries are fine), accept them with an IAR, then add ORS and DV on the package’s Finance tab.',
      'The activity’s Procurement & Implementation stage completes by itself when every non-cancelled package is closed.',
    ],
    tips: [
      'Re-award a package if a supplier fails; the previous supplier stays in its history.',
      'Split, merge or cancel packages from the package menu; each change asks for a reason and is logged.',
      'The Packages tab has table, board and timeline views.',
    ],
    link: { to: '/activities', label: 'Open Activities' },
  },
  {
    id: 'finance',
    title: 'PPMP, APP, allotments, ORS and DV sheets',
    summary:
      'The other finance sheets receive rows from the WFP; you complete the remaining columns there.',
    steps: [
      'Finance has a tab for each sheet: WFP, PPMP, APP, Allotments, ORS register and DV register.',
      'When the WFP is saved, its rows appear where they belong: rows with a supplier or PO in the ORS register, amounts for disbursement in the DV register, budget lines in the PPMP and activities in the APP.',
      'The note above each sheet names the columns that follow the WFP. Change those in the WFP; fill in the rest (ORS No., dates, mode of procurement…) on the sheet itself.',
      'Allotments is typed directly: SARO, sub-allotments and other releases.',
      'Formulas can read another sheet by its name, for example =SUM(WFP!G4:G50).',
    ],
    tips: [
      'A sheet whose columns were changed from the template is marked Custom and is no longer filled from the WFP automatically.',
    ],
    link: { to: '/finance', label: 'Open Finance' },
  },
  {
    id: 'approvals',
    title: 'Requests and approvals',
    summary: 'Ask for extensions, cancellations, stage skips, re-awards and more.',
    steps: [
      'Use the Request menu on an activity or package, “Request skip” on a stage, or “Request realignment” in Finance → Allotments.',
      'Write the justification. Program admins (or the superadmin) decide; you cannot decide your own request.',
      'Approved requests take effect immediately. Rejected ones show the decider’s note.',
    ],
    link: { to: '/approvals', label: 'Open Approvals' },
  },
  {
    id: 'monitoring',
    title: 'Progress updates, issues and directives',
    summary: 'Report progress, raise issues, and respond to directives and overdue notices.',
    steps: [
      'On an activity’s Progress tab, add an update: physical %, quantity, participants, a self-assessment and a short narrative. The obligated and disbursed amounts are captured for you.',
      'On the Issues tab, raise an issue or risk with its severity. High and critical ones notify the program admins.',
      'Directives and overdue notices arrive in Directives and My Tasks. Acknowledge them, then respond with a status update and a revised target date.',
      'Admins can send an overdue notice from the activity, the package, or straight from the Dashboard’s Overdue panel.',
    ],
    link: { to: '/directives', label: 'Open Directives' },
  },
  {
    id: 'calendar-tasks',
    title: 'My Tasks and the Calendar',
    summary: 'See what’s due and when.',
    steps: [
      'My Tasks groups your stages, checklist tasks, directives, approvals and issues into Overdue, Today, Next 7 days and Later. Tick checklist tasks off right there.',
      'The Calendar shows activity dates, stage targets, package solicitations, awards, deliveries, payment due dates, directive deadlines and issue targets.',
      'Package events are colour-coded by category; use the checkboxes to hide groups. Switch to Agenda for a list.',
      'Click any event to open it.',
    ],
    link: { to: '/calendar', label: 'Open the Calendar' },
  },
  {
    id: 'reports',
    title: 'The Dashboard and Reports',
    summary: 'See the budget, obligations, disbursements and physical progress at a glance.',
    steps: [
      'The Dashboard opens with the WFP budget, Obligated, Disbursed and Unobligated balance, then budget by phase, activities by status, physical targets against accomplishments, targets by quarter and the largest activities.',
      'Click Customize to move, resize, hide or add cards. Reset returns to the default layout.',
      'To show your own figure, select cells in a finance sheet, right-click and choose “Show on dashboard”, or use the card button on the Σ totals row. Name the card and it appears under Customize → Cards.',
      'Reports lists the utilization, accomplishment, procurement, beneficiary and compliance reports. Filter or sort, then Export .xlsx or Print.',
    ],
    link: { to: '/dashboard', label: 'Open the Dashboard' },
  },
  {
    id: 'files-links',
    title: 'Files and Links',
    summary:
      'Keep presentations, spreadsheets, documents, pictures and links in one place, each with a QR code.',
    steps: [
      'Open Files and Links and click “Link a file”.',
      'In Google Drive choose Share → “Anyone with the link” → Viewer, copy the link and paste it. Give it a name; the kind is detected for you.',
      'Click a card to view the file inside PAYEW. Google Slides, Sheets, Docs, Drive files and folders, pictures and YouTube open in place; other links open in a new tab.',
      'Every card has a QR code. Scan it with a phone to open the file, or click it to enlarge and Download PNG for slides and printed handouts.',
    ],
    tips: [
      'Files are linked for now, not uploaded. Uploading straight to PAYEW will be turned on once file storage is available.',
      'Removing a link does not delete the file in Drive.',
    ],
    link: { to: '/library', label: 'Open Files and Links' },
  },
  {
    id: 'records',
    title: 'Beneficiaries and suppliers',
    summary: 'Keep the shared master lists clean.',
    steps: [
      'Beneficiaries and Suppliers are shared by all programs. Before adding one, the system checks for similar names (and TINs for suppliers) to avoid duplicates. Both can be imported from and exported to Excel.',
      'Supplier profiles show packages, totals awarded and paid, on-time delivery and ratings. Bank details and ratings are visible to admins only.',
      'Deleted records go to Trash, where admins can restore them.',
    ],
    link: { to: '/beneficiaries', label: 'Open Beneficiaries' },
  },
]

export interface Faq {
  q: string
  a: string
}

export const FAQS: Faq[] = [
  {
    q: 'I can’t edit an activity. Why?',
    a: 'Program staff need “can edit activities” turned on by an admin. Locked fiscal years and archived programs are read-only for everyone.',
  },
  {
    q: 'Why was my upload not accepted?',
    a: 'Uploads must have the same columns as the sheet’s template. Download the template from the Upload dialog, paste your data into it and upload again.',
  },
  {
    q: 'I added an activity in the WFP but it is not in Activities (Physical).',
    a: 'Save the WFP first. The row also needs an activity title and a unit of measure. You can run it again from “Linked sheets” → “Update linked sheets now”.',
  },
  {
    q: 'Can I complete a workflow stage without all the details?',
    a: 'Yes. Missing fields and documents are shown as a warning only.',
  },
  {
    q: 'Where did the Documents page go?',
    a: 'It was replaced by Files and Links, where files are linked from Google Drive and each has a QR code.',
  },
  {
    q: 'Why was my ORS saved with a warning?',
    a: 'Validation strictness is set to “warn” in Settings, so the ORS went through but the check that failed is recorded as a flag on the record. In “block” mode the save is rejected instead.',
  },
  {
    q: 'A delivery arrived before the ORS. Is that allowed?',
    a: 'Yes, but on a package set to “obligate before delivery” it is an exception: add an exception remark, and an obligation-order exception request is raised for the admin.',
  },
  {
    q: 'When does the Procurement & Implementation stage finish?',
    a: 'Automatically, when every package that isn’t cancelled is closed. A program admin can complete it earlier with a written justification.',
  },
  {
    q: 'Who receives an overdue notice?',
    a: 'By default the person assigned to the current stage and the responsible person. Notices that aren’t answered escalate to program admins and then to the superadmin.',
  },
  {
    q: 'I deleted something by mistake.',
    a: 'Ask a program admin (or the superadmin) to restore it from Trash. Files keep all their versions.',
  },
  {
    q: 'How do I stop getting so many notifications?',
    a: 'Notifications → Preferences lets you mute comments, mentions, assignments, stage and task reminders, delivery and progress reminders. Directives, overdue notices, approvals and escalations can’t be muted.',
  },
  {
    q: 'Do reports include all programs?',
    a: 'They follow the Program selector in the top bar. The superadmin can pick “All programs”.',
  },
]

export interface Term {
  term: string
  meaning: string
}

export const GLOSSARY: Term[] = [
  {
    term: 'ABC',
    meaning: 'Approved Budget for the Contract — the ceiling for a procurement package.',
  },
  {
    term: 'Allotment',
    meaning: 'Authority to incur obligations, issued through a SARO or sub-allotment (SAA).',
  },
  { term: 'APP', meaning: 'Annual Procurement Plan — consolidated from the PPMPs.' },
  {
    term: 'BUR',
    meaning: 'Budget Utilization Rate/Report — obligations against the allotment or budget.',
  },
  {
    term: 'CO',
    meaning: 'Capital Outlay — expense class for equipment, infrastructure and other assets.',
  },
  { term: 'DR', meaning: 'Delivery Receipt — the supplier’s proof of delivery.' },
  { term: 'DV', meaning: 'Disbursement Voucher — authorizes a payment against one or more ORS.' },
  {
    term: 'Expense class',
    meaning: 'PS, MOOE or CO; allotments and obligations are tracked per class.',
  },
  { term: 'FA', meaning: 'Farmers’ Association — a common beneficiary type.' },
  {
    term: 'IAR',
    meaning: 'Inspection and Acceptance Report — confirms a delivery was inspected and accepted.',
  },
  {
    term: 'MOOE',
    meaning:
      'Maintenance and Other Operating Expenses — expense class for supplies, travel, trainings, etc.',
  },
  { term: 'NOA', meaning: 'Notice of Award — tells the winning supplier the contract is theirs.' },
  { term: 'NTP', meaning: 'Notice to Proceed — authorizes the supplier to start.' },
  {
    term: 'ORS',
    meaning:
      'Obligation Request and Status — commits (obligates) part of the allotment to a purpose.',
  },
  {
    term: 'Package',
    meaning: 'A procurement lot within an activity with its own supplier, workflow and money.',
  },
  { term: 'Payables', meaning: 'Delivered and accepted but not yet paid.' },
  {
    term: 'PhilGEPS',
    meaning:
      'Philippine Government Electronic Procurement System; suppliers need a valid registration.',
  },
  { term: 'PO', meaning: 'Purchase Order — the contract document for goods.' },
  {
    term: 'PPMP',
    meaning: 'Project Procurement Management Plan — what a unit plans to procure, by month.',
  },
  { term: 'PR', meaning: 'Purchase Request — the request that starts a procurement.' },
  { term: 'PS', meaning: 'Personnel Services — expense class for salaries and benefits.' },
  { term: 'RFQ', meaning: 'Request for Quotation — the solicitation sent to suppliers.' },
  { term: 'SAA', meaning: 'Sub-Allotment Advice — passes part of an allotment down to an office.' },
  { term: 'SARO', meaning: 'Special Allotment Release Order — releases an allotment from DBM.' },
  {
    term: 'Savings',
    meaning: 'ABC minus the contract amount; confirmed savings can be realigned.',
  },
  {
    term: 'SVP',
    meaning: 'Small Value Procurement — a negotiated procurement mode for small amounts.',
  },
  { term: 'TIN', meaning: 'Taxpayer Identification Number — used to spot duplicate suppliers.' },
  { term: 'TOR', meaning: 'Terms of Reference — specifications for services.' },
  {
    term: 'UACS',
    meaning:
      'Unified Accounts Code Structure — the government’s account codes for objects of expenditure.',
  },
  { term: 'WFP', meaning: 'Work and Financial Plan — the year’s targets and budget by month.' },
]
