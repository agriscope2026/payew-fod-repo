# Addendum C: Data import and customizable dashboard (2026-11-11)

**Import.** WFP and all Finance sheets, and Activities, can be filled three ways: file import,
fetch from an online Google Sheet link, or manual entry. After fetching, the user sees the data,
can remove or add rows, and then proceeds to save it to the database.

- Sheets are shared as "Anyone with the link" (no Google sign-in).
- Signatories in the source form are not imported.
- Users can change the template and its columns, and the template file can be downloaded.
- Reference form: the DA-CAR AMIA workbook, `1AWoNwmteIqgWtMohDzdCTBiMT858jFCde6jh1PyMRp0`.

**Dashboard.** Users choose which cards are displayed, and set each card's size and position.
Each user has their own layout; the superadmin sets the default.

**WFP monitoring sheet.** The "DA-CAR WFP with obligations" template reads the tab that has an "Amount for obligation" column. Each line item keeps its amount, and supplier rows beneath it roll up. Obligated comes from "Total obligation"; disbursed comes from "For disbursement" where PAID is ticked. These are stored on the WFP lines because the sheet has no ORS or DV numbers.

**Dashboard headline.** The first card is the total budget for the year, with the WFP total beneath it. For a program with no ORS records, obligated and disbursed use the WFP-line amounts; once a program has an ORS, its ORS and DV records are used instead, and the two are never added together. Allotment is hidden by default and can be turned on from the Cards list.
