// Table tests for isValidEmail(). No network. Placeholder cases are real rows that reached the prospects table.
// Run: npx tsx scripts/email-validator-cases.ts
import { isValidEmail } from '../lib/discovery'

const cases: [string, boolean, string][] = [
  ['abc@xyz.com', false, 'template placeholder (Gomez Trial Attorneys)'],
  ['example@mail.com', false, 'template placeholder (Southwestern Consulting)'],
  ['name@company.com', false, 'template placeholder'],
  ['john@company.com', false, 'placeholder domain'],
  ['user@domain.com', false, 'placeholder local part and domain'],
  ['example@mysite.com', false, 'placeholder local part'],
  ['example@domain.com', false, 'placeholder'],
  ['alan.smith@email.com', false, 'placeholder domain'],
  ['home-banner@2x.webp', false, 'image filename'],
  ['test@realbusiness.com', false, 'test local part'],
  ['info@krupplaw.com', true, 'generic but real'],
  ['scott@conceptproperty.com', true, 'named owner'],
  ['username@realfirm.com', true, '"user" only as the whole local part'],
  ['abcdental@gmail.com', true, '"abc" only as the whole local part'],
  ['kdah13882@gmail.com', true, 'real gmail'],
  ['contact@mailchimpagency.com', true, 'mail.com only as the whole domain'],
  ['gene@constellations.community', true, 'long TLD (Constellations founder)'],
  ['jj@out.fitness', true, 'long TLD'],
  ['corey@voltage.digital', true, 'long TLD'],
]

let failed = 0
for (const [email, expected, why] of cases) {
  const got = isValidEmail(email)
  if (got !== expected) {
    failed++
    console.log(`FAIL  ${why}: ${email} -> ${got}, want ${expected}`)
  }
}
console.log(`${cases.length - failed}/${cases.length} passed`)
if (failed) process.exit(1)
