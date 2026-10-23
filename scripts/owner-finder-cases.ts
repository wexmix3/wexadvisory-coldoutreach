// Table tests for the owner finder's pure rules. No network. Cases come from the 2026-10-23 Apollo trial.
// Run: npx tsx scripts/owner-finder-cases.ts
import { pickSenior, sameBusiness, seniority } from '../lib/owner-finder'

let failed = 0
const check = (got: unknown, want: unknown, why: string) => {
  if (got !== want) { failed++; console.log(`FAIL  ${why}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`) }
}

check(seniority('Co-Founder & CEO'), 0, 'founder is tier 0')
check(seniority('Principal and COO'), 0, 'principal is tier 0')
check(seniority('Attorney and Founding Partner'), 0, 'founding partner is tier 0 via founder')
check(seniority('Partner'), 1, 'partner is tier 1')
check(seniority('Director of Events'), null, 'events director is not a buyer')
check(seniority('Associate Vice President'), null, 'associate titles excluded')
check(seniority('Marketing Coordinator'), null, 'coordinator excluded')
check(seniority(null), null, 'no title')

check(sameBusiness('Innovetive Petcare', 'Doral Centre Animal Hospital', 'doralvet.com'), false, 'chain parent is not the local business')
check(sameBusiness('Krupplaw.com', 'Krupp Law Offices PC', 'krupplaw.com'), true, 'domain-shaped org name')
check(sameBusiness('Simpson | McCrady, LLC', 'Simpson & McCrady LLC', 'simpsonmccrady.com'), true, 'punctuation differences')
check(sameBusiness('Good Coworking', 'Good Coworking', 'goodcoworking.co'), true, 'exact name')
check(sameBusiness('FNEX', 'FNEX Wealth', 'fnexwealth.com'), true, 'short brand')
check(sameBusiness('Bamboo', 'Bamboo Grand Rapids: Coworking & Events Center', 'bamboocowork.com'), true, 'brand inside a long listing')
check(sameBusiness('Acme Coworking', 'Good Coworking', 'goodcoworking.co'), false, 'shared generic word only')
check(sameBusiness(undefined, 'Good Coworking', 'goodcoworking.co'), false, 'no org name')

const people = [
  { id: 'a', first_name: 'Maria', title: 'Director of Events', has_email: true, organization: { name: 'SoWa Power Station' } },
  { id: 'b', first_name: 'Sam', title: 'Partner', has_email: true, organization: { name: 'Krupplaw.com' } },
  { id: 'c', first_name: 'George', title: 'President', has_email: true, organization: { name: 'Krupplaw.com' } },
  { id: 'd', first_name: 'Christian', title: 'Founder', has_email: false, organization: { name: 'Krupplaw.com' } },
]
check(pickSenior(people, 'Krupp Law Offices PC', 'krupplaw.com')?.id, 'c', 'most senior with an email wins')
check(pickSenior(people.slice(0, 1), 'SoWa Health + Wellness', 'sowahealthandwellness.com'), null, 'junior title at a lookalike org is skipped')

console.log(failed ? `${failed} failed` : 'all passed')
if (failed) process.exit(1)
