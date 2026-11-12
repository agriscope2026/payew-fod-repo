# Addendum D: Free-form finance sheets (2026-11-12)

Replaces the record-based finance screens (plan grids, allotment/ORS/DV forms,
payables, savings) with Excel-like sheets. Decided by the product owner: finance
data is edited directly in the sheets; it is no longer linked to activities,
packages or ORS/DV records.

**Sheets.** One sheet each for WFP, PPMP, APP, Allotments, ORS and DV, per program
and fiscal year. Cells hold values, formulas (Excel syntax, including other sheets
such as `=SUM(ORS!H:H)`) and formatting: bold, italic, underline, strike, colors,
alignment, wrap, number formats, borders, merged cells, frozen panes, column widths
and row heights. Editing: type, paste from Excel or Google Sheets, fill handle,
Ctrl+D, insert and delete rows or columns, sort, undo and redo.

**Templates.** New sheets start from a built-in layout. Changing the header row or
the number of columns makes the sheet "Custom".

**Uploads.** An Excel, CSV or OpenDocument file, or a shared Google Sheet, opens as
a draft that keeps its own columns, formulas and formatting. The user cleans it up
(remove empty rows and columns, trim spaces, convert numbers stored as text, replace
formulas with values, clear formatting, unmerge) and then finalizes it, which makes
it the sheet. The replaced version stays in Version history.

**Saving.** Saves are refused when someone else saved first. The last 30 versions
are kept and can be restored. Sheet contents are kept out of the audit log; the
log records each save.

**Export.** A styled .xlsx: title and subtitle, a frozen and repeated header row,
filters, thin rules, bold total rows, peso and number formats, landscape A4 fitted
to the page width, page numbers. Formulas stay formulas; formulas that read other
sheets are written as values.

**Dashboard cards.** Selected cells become a card ("Show on dashboard"): a name,
optional details, a calculation (sum, average, count, smallest, largest, first
value), a format and an optional second line. A card can instead be a line under
"Total budget for the year". Cards follow their cells when rows are inserted. The
finance cards that read ORS/DV records were removed from the dashboard.

**Not changed.** Reports, approvals (savings) and the database tables for the old
finance records remain; they no longer receive new data from the Finance page.

## Update (2026-11-12): WFP template, Activities (Physical), row dialogs, DA exports

**WFP template.** Follows the DA-CAR AWFP monitoring layout: PAP; physical target
(unit of measure, annual total); financial target (object of expenditure, four
quarters, annual total); obligation (amount for obligation, total obligation,
balance); procurement (PO No., supplier, particulars); disbursement (for
disbursement, a Paid checkbox, total disbursement); remarks. The grand total sits
above the rows. Users can still change it; History offers "Start over from the template".

**WFP → Activities.** A WFP row with a PAP and a unit of measure is an activity. Its
budget is the row's annual total, or the sum of its line items; obligated and
disbursed add up the rows under it (disbursed counts rows with Paid ticked) until
the next activity or subtotal heading. Saving or finalizing the WFP creates or
updates the activities (`sync_wfp_activities`), adopting an activity with the same
title that was typed in before. A row that leaves the WFP marks its activity "Not in
WFP"; nothing is deleted. The "Activities" button on the WFP shows which columns
feed the activities and lets users point them elsewhere.

**Activities (Physical).** Monthly and quarterly targets and accomplishments in the
BED 2 layout, a cumulative line chart, totals, status filters and search. Clicking an
activity shows its workflow, monthly targets and accomplishments (editable), status,
and its budget, obligated, disbursed and balance from the WFP. Workflow tracking stays
on the activity page. The board view and the stage, province, responsible and date
filters were removed. Importing the BED 2 or "ACCOMPLISHMENT_ BED 2" tab fills the
monthly figures of matching activities (titles are matched loosely) and adds the rest.

**Row dialogs.** Any row of a finance sheet opens as a form (hover the row number, or
right-click → Open row details). For WFP rows it also shows the activity it belongs to.

**Exports.** Department of Agriculture look: the DA seal, "Republic of the Philippines /
Department of Agriculture / Regional Field Office · Cordillera Administrative Region",
the title in green, a gold rule, green headers with a gold underline, light gold total
rows and soft green bands. The seal (public/brand/da-logo.png) is the public-domain
rendering from Wikimedia Commons; replace the file to use another version.

## Update 2 (2026-11-12): template-only uploads, WFP hierarchy, dropdowns

**Uploads.** A file or Google Sheet tab is accepted only if it has every column of
the sheet's template (any order, extra columns ignored, header found in the first 30
rows). Its rows are copied into a fresh template, so formulas, formats and dropdowns
are always the template's. For the WFP, the DA-CAR AWFP form (one column for phases,
activities and sub-activities) is also accepted and converted. Other tabs are refused
with the list of missing columns. "Download the template" gives the file to fill in.

**WFP template (v3).** Phase / Component, Activity, Sub-activity in separate columns;
unit and annual target; object of expenditure and annual budget (no quarter or month
columns); obligation; procurement; disbursement with a Paid checkbox; Status (a
dropdown); remarks. Wider columns; long text wraps.

**Dropdowns.** Any column can have a list of choices (toolbar → Dropdown). The WFP
Status column starts with Accomplished, Ongoing, Obligated, For procurement, To be
conducted, Delayed, Cancelled.

**BED 2 with the WFP.** When uploading, the monthly physical targets (BED 2 tab) and
statuses (accomplishment tab) are matched to activities by title. Targets fill an
activity's monthly targets only while they are still empty. Phase and status show on
the Activities page, which groups activities by phase.

**Start fresh.** `supabase/scripts/clear_activities.sql` empties activities and what
hangs from them; finance sheets, accounts and master lists stay.

**Layout.** Finance and Activities use the full screen width; row and activity dialogs
are wider.

## Update 3 (2026-11-12): numbering, outline, WFP totals on the dashboard

**Numbering.** Saving a WFP puts its numbering in order: "Phase 1:", "1.1.", "1.1.1.",
"a.", "b."… Existing numbers decide how deep a row sits; rows typed without a number in
the Activity column join the level around them. Headings that are not "Phase …" (LFP-CRA,
PMO) and the rows under them stay unnumbered. "Fix numbering" does the same on demand.

**Outline.** Phase and activity rows have expand/collapse arrows; the Outline menu shows
phases only, phases and activities, or everything. Phase groups on the Activities page
collapse too. Collapsing is a view setting and is not saved.

**Totals.** A pinned bottom row sums each number column. Clicking a total offers it as a
dashboard card. The dashboard also has built-in cards from the WFP (budget, obligated,
disbursed, unobligated balance), listed under Customize → Cards.

**Type size.** Sheets use 14px text; exports use 11–11.5pt with a larger title block.

## Update 4 (2026-11-12): WFP as the main input, relaxed workflow, files page

**WFP feeds other sheets.** Saving the WFP reflects its rows into the ORS register
(rows with a supplier or PO), DV register (rows with an amount for disbursement), PPMP
(budget lines) and APP (one row per activity). Reflected rows stay linked to their WFP
row; the columns that follow the WFP are overwritten on each save, the rest are typed on
the sheet. The WFP's "Linked sheets" button shows this and can run it on demand.
Activities are no longer created on the Activities page.

**Status.** An activity's status is the Status column of its WFP row. It can be set from
the activity's workflow tab or its dialog, which writes it into the WFP. The dashboard
and the Activities page chart activities by this status.

**Workflow.** Empty required fields and open required checklist items no longer block a
stage; the app lists them as still missing. Stage order, sub-steps and open packages are
still checked.

**Dashboard default.** WFP budget, obligated, disbursed and balance; cards made from
sheet cells; physical targets vs accomplishments; activities by status; budget and
obligations by phase; then the existing panels.

**Presentations & Files (/library).** Links to Google Drive files (Slides, Sheets, Docs,
PDFs, pictures, folders), YouTube and other https links, per program. Drive files,
pictures and YouTube show inside PAYEW; other links open in a new tab. Uploading waits
for file storage.

**Sidebar.** The "Programs" section is "Plans & Operations"; Finance comes before
Activities (Physical).
