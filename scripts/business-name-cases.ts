// Table tests for shortBusinessName(). No network. Cases are real Google Places names from the prospects table.
// Run: npx tsx scripts/business-name-cases.ts
import { shortBusinessName } from '../lib/business-name'

const cases: [string, string, string][] = [
  ['Royal Vet - Animal Hospital on Miami Beach', 'Royal Vet', 'dash tagline'],
  ['Stenger Tax Advisory | Chicago Accountant', 'Stenger Tax Advisory', 'pipe tagline'],
  ['Club 300 Tribeca - Luxury Gym | Personal Trainer', 'Club 300 Tribeca', 'dash and pipe'],
  ['Edward Jones - Financial Advisor: Robert Farwell, CFP®|AAMS®', 'Edward Jones', 'franchise listing'],
  ['Spodek Law Group P.C. - Manhattan Office', 'Spodek Law Group', 'dash then legal suffix'],
  ['Vetique: Gold Coast & River North\'s Premium Veterinary Care', 'Vetique', 'colon tagline'],
  ['Bamboo Grand Rapids: Coworking & Events Center', 'Bamboo Grand Rapids', 'colon tagline'],
  ['Social: Managed.', 'Social: Managed.', 'colon inside a brand stays'],
  ['Primary Care Health Services Inc.: West End Health Center', 'Primary Care Health Services', 'colon then legal suffix'],
  ['Pet Lovers Animal Clinic @NW 7th St', 'Pet Lovers Animal Clinic', 'at-sign location'],
  ['New York Living Solutions @ Keller Williams NYC', 'New York Living Solutions', 'at-sign brokerage'],
  ['Columbus House Team / Expert Partners', 'Columbus House Team', 'spaced slash'],
  ['B/SPOKE Downtown Boston', 'B/SPOKE Downtown Boston', 'unspaced slash is part of the brand'],
  ['Ezzy Insurance (formerly Advanced Insurance Group)', 'Ezzy Insurance', 'parenthetical'],
  ['Premier Staffing Solution (PSS)', 'Premier Staffing Solution', 'acronym parenthetical'],
  ['Acute Wealth Advisors, LLC', 'Acute Wealth Advisors', 'comma LLC'],
  ['Fisher Stone, P.C.', 'Fisher Stone', 'comma P.C.'],
  ['Shapiro Legal Group PLLC', 'Shapiro Legal Group', 'PLLC'],
  ['Osaghae & Associates, Ltd.', 'Osaghae & Associates', 'Ltd.'],
  ['ROOST Real Estate Co.', 'ROOST Real Estate', 'Co.'],
  ['Zukerman, Lear, Murray & Brown Co., L.P.A. | Cleveland Criminal Defense Attorneys', 'Zukerman, Lear, Murray & Brown', 'partner list survives, stacked suffixes go'],
  ['Braj Aggarwal, CPA, P.C. - Trusted CPA & Accountant in NYC', 'Braj Aggarwal, CPA', 'short credential stays'],
  ['The Bizzarro Agency, New York Real Estate Agents', 'The Bizzarro Agency', 'long comma tail'],
  ['Hansen & Rosasco, LLP', 'Hansen & Rosasco', 'LLP'],
  ['Krupp Law Offices PC', 'Krupp Law Offices', 'PC without comma'],
  ['Good Coworking', 'Good Coworking', 'clean name untouched'],
  ['FORMAT', 'FORMAT', 'short clean name untouched'],
  ['PC Repair Pros', 'PC Repair Pros', 'leading PC is not a suffix'],
  ['A.B. - Consulting', 'A.B. - Consulting', 'head too short, keep original'],
  ['  Mila  ', 'Mila', 'whitespace trimmed'],
  ['Sandlot & Co.', 'Sandlot & Co.', '"& Co." is part of the name'],
  ['Craig, Kelley and Faultless LLC', 'Craig, Kelley and Faultless', 'partner list joined with "and"'],
  ['Weichert, Realtors Jersey City Downtown', 'Weichert', 'long comma tail without partners'],
  ['Seattle Accountants Professional Corporation', 'Seattle Accountants', 'Professional Corporation suffix'],
  ['Saper Law I Intellectual Property I Entertainment I Social Media I Business', 'Saper Law', 'capital I used as a divider'],
  ['Studio I Design', 'Studio I Design', 'a single I is not a divider'],
  [null as unknown as string, '', 'null never throws'],
]

let failed = 0
for (const [input, expected, why] of cases) {
  const got = shortBusinessName(input)
  if (got !== expected) {
    failed++
    console.log(`FAIL  ${why}\n      in:   ${input}\n      want: ${expected}\n      got:  ${got}`)
  }
}
console.log(`${cases.length - failed}/${cases.length} passed`)
if (failed) process.exit(1)
