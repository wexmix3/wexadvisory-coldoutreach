// Table tests for validateOwnerFirstName() and nameFitsEmail(). No network, no API calls.
// Run: npx tsx scripts/contact-name-cases.ts
import { nameFitsEmail, validateOwnerFirstName } from '../lib/enrichment'

const SITE = `[Homepage]: Welcome to Cedar Street Coworking. Our team is here to help.
[About]: Founded in 2019 by Mollie Tran and DR. JAMES O'Neil. Contact Renée at the front desk. Annabelle runs events.`

const cases: [unknown, string, string | null, string][] = [
  ['Mollie', SITE, 'Mollie', 'name present in the text'],
  ['Mollie Tran', SITE, 'Mollie', 'full name is cut to the first name'],
  ['mollie', SITE, 'Mollie', 'casing is normalised'],
  ["Dr. James O'Neil", SITE, 'James', 'title is stripped, upper-case source still matches'],
  ["Dr. O'Neil", SITE, null, 'title plus one word is a surname, not a first name'],
  ['Team', SITE.replace('Our team', 'Our Team'), null, 'generic word even when capitalised in the text'],
  ['Will', 'We will help. Founded by Sam.', null, 'common-word name that only appears lowercase'],
  ['Will', 'Founded by Will Carter in 2011.', 'Will', 'common-word name, capitalised in the text'],
  ['Renée', SITE, 'Renée', 'accented name'],
  ['Sarah', SITE, null, 'name the site never mentions (model invention)'],
  ['Anna', SITE, null, 'substring of Annabelle is not a whole-word match'],
  ['Team', SITE, null, 'generic word that does appear in the text'],
  ['Our', SITE, null, 'generic word'],
  [null, SITE, null, 'model returned null'],
  ['null', SITE, null, 'model returned the string "null"'],
  ['', SITE, null, 'empty string'],
  [42, SITE, null, 'wrong type'],
  ['Mollie', '', null, 'scrape failed, so nothing can be confirmed'],
  ['M', SITE, null, 'single letter'],
  ['info@cedar.com', SITE, null, 'not a name'],
]

let failures = 0
for (const [input, site, expected, label] of cases) {
  const got = validateOwnerFirstName(input, site)
  const ok = got === expected
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(input)} -> ${JSON.stringify(got)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`)
}
const emailCases: [string, string, boolean, string][] = [
  ['Gene', 'info@constellations.com', true, 'shared inbox'],
  ['Gene', 'front.desk@constellations.com', true, 'shared inbox with punctuation'],
  ['Gene', 'gene@constellations.com', true, "the person's own address"],
  ['Gene', 'gene.kansas@constellations.com', true, 'own address, first.last'],
  ['Gene', 'lauren@greyfoxpr.com', false, "someone else's address"],
  ['Gene', 'jsmith@constellations.com', false, 'initial-style address for another person'],
  ['Gene', 'genekansas@constellations.com', true, 'own address, firstlast with no separator'],
  ['Ed', 'fred@acme.com', false, 'short name inside another name'],
  ['Al', 'mallory@acme.com', false, 'short name inside another name'],
  ['Ann', 'hannah@acme.com', false, 'name inside another name'],
  ['Ed', 'ed@acme.com', true, 'short name, exact address'],
]
for (const [name, email, expected, label] of emailCases) {
  const got = nameFitsEmail(name, email)
  const ok = got === expected
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${name} / ${email} -> ${got}${ok ? '' : ` (expected ${expected})`}`)
}

const total = cases.length + emailCases.length
console.log(`\n${total - failures}/${total} passed`)
process.exit(failures ? 1 : 0)
