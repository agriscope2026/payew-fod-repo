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
      'Use the Fiscal year and Program selectors in the top bar. Almost every page — Dashboard, Activities, Finance, Calendar, Reports — follows them.',
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
    title: 'Planning: WFP, PPMP and APP',
    summary: 'Build the year’s plans in an Excel-like sheet and submit them for approval.',
    steps: [
      'Go to Finance → WFP / PPMP / APP and choose the plan type.',
      'Type in the grid like Excel: arrow keys move, typing edits, Ctrl+C / Ctrl+V copy to and from Excel, Shift+click selects a range. Or use Import to load an .xlsx.',
      'Amount is quantity × unit cost. Rows whose monthly schedule does not add up to the amount are flagged.',
      'On PPMP/APP rows you can tag the procurement package a line belongs to.',
      'Click Submit. A program admin reviews and approves it; approved plans are read-only until reopened.',
    ],
    link: { to: '/finance?tab=plans', label: 'Open the plans' },
  },
  {
    id: 'activities',
    title: 'Activities and their workflow',
    summary: 'Create an activity, move it through its stages and keep its checklist complete.',
    steps: [
      'Activities → New activity. Fill in the title, dates, budget, location and responsible person.',
      'The activity gets its program’s workflow (Design → Approval → PPMP/WFP/APP → Procurement & Implementation → Liquidation → Savings → Closed).',
      'On the Workflow tab, Start and Complete each stage. A stage cannot be completed until its required fields and documents are in.',
      'Uploading a required document (e.g. the PR) ticks its checklist item automatically.',
      'Link the beneficiaries served on the Beneficiaries tab.',
    ],
    tips: [
      'Stages show their planned dates; overdue ones turn red and trigger reminders and, later, escalation.',
      'Staff need “can edit activities” on their account to change activities.',
    ],
    link: { to: '/activities', label: 'Open Activities' },
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
    title: 'Allotments, obligations and payments',
    summary: 'Record SARO/SAA allotments, ORS, deliveries and DVs, and read the warnings.',
    steps: [
      'Program admins enter allotments (SARO, sub-allotments, realignments, reversions) under Finance → Allotments.',
      'On a package’s Finance tab: add ORS (several are allowed), deliveries with their items, and DVs. Each DV is charged to one or more ORS and can be a partial payment.',
      'Non-package costs (honoraria, direct payments) go on the activity’s Finance tab.',
      'The system checks ORS ≤ contract (or ABC), ORS ≤ activity budget, ORS ≤ allotment, deliveries ≤ contract and DV ≤ unpaid ORS. Depending on Settings it blocks the save or saves it with a warning flag.',
      'Finance → Payables lists accepted deliveries not yet paid, with days outstanding.',
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
    title: 'Reports and the Dashboard',
    summary: 'Monitor utilization and export reports to Excel.',
    steps: [
      'The Dashboard shows the allotment, obligation and disbursement rates, overdue items, pending deliveries, spending by supplier and category, obligation aging and each program’s compliance.',
      'Reports lists the Budget Utilization Report (with activity → package → supplier drill-down), Accomplishment, Procurement Status, Supplier Performance, Supplier Awards & Payments, Savings, Payables, Beneficiaries and Compliance.',
      'Filter or sort any report, then Export .xlsx or Print.',
    ],
    link: { to: '/reports', label: 'Open Reports' },
  },
  {
    id: 'records',
    title: 'Beneficiaries, suppliers and documents',
    summary: 'Keep the shared master lists clean.',
    steps: [
      'Beneficiaries and Suppliers are shared by all programs. Before adding one, the system checks for similar names (and TINs for suppliers) to avoid duplicates. Both can be imported from and exported to Excel.',
      'Supplier profiles show packages, totals awarded and paid, on-time delivery and ratings. Bank details and ratings are visible to admins only.',
      'Documents holds every uploaded file. Package documents are filed under program → activity → package automatically. Uploading a new version keeps the old ones.',
      'Deleted records go to Trash, where admins can restore them.',
    ],
    link: { to: '/repository', label: 'Open Documents' },
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
