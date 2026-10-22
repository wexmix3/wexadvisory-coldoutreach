// Google Places display names are often keyword-stuffed listings, not what the owner calls the business:
// "Royal Vet - Animal Hospital on Miami Beach", "Stenger Tax Advisory | Chicago Accountant", "Fisher Stone, P.C.".
// shortBusinessName() turns them into the name a person would write in an email. The stored business_name is
// never changed; this only shapes what renders in subject lines and bodies.

const SEPARATORS = [/\s+[-–—]\s+/, /\s+\|\s+/, /\s+\/\s+/, /\s*@\s*/]
// "& Co." is part of the name ("Sandlot & Co."), so a suffix right after an ampersand stays.
const LEGAL_SUFFIX = /(?<!&),?\s+(L\.?L\.?C\.?|Inc\.?|Incorporated|P\.?C\.?|P\.?L\.?L\.?C\.?|L\.?L\.?P\.?|L\.?P\.?A\.?|Ltd\.?|Corp\.?|Professional Corporation|Corporation|Co\.)$/i
// Some listings use a capital I as a divider ("Saper Law I Intellectual Property I Entertainment"); only treated
// as one when it appears at least twice, so a lone "I" inside a name is left alone.
const I_DIVIDER = /\s+I\s+/

// A cut is only kept when what remains still has at least three letters ("A.B." is not a name).
const hasName = (s: string) => (s.match(/\p{L}/gu) ?? []).length >= 3

export function shortBusinessName(raw: string | null | undefined): string {
  // The column is NOT NULL, but a send must never crash on a bad row; the old renderer tolerated null.
  const original = (raw ?? '').trim()
  let name = original.replace(/\s*\([^)]*\)/g, '').trim()

  for (const sep of SEPARATORS) {
    const head = name.split(sep)[0].trim()
    if (hasName(head)) name = head
  }
  if (name.split(I_DIVIDER).length >= 3) {
    const head = name.split(I_DIVIDER)[0].trim()
    if (hasName(head)) name = head
  }

  // A colon splits brand from tagline ("Vetique: Gold Coast & River North's Premium Veterinary Care"),
  // but a one-word tail is part of the brand ("Social: Managed.").
  const colon = name.match(/^(.{3,}?):\s+(.+)$/)
  if (colon && colon[2].trim().split(/\s+/).length >= 2) name = colon[1].trim()

  // Strip legal suffixes, repeatedly for "Co., L.P.A." style stacks.
  let previous = ''
  while (previous !== name) {
    previous = name
    const stripped = name.replace(LEGAL_SUFFIX, '').trim()
    if (hasName(stripped)) name = stripped
  }

  // A long descriptive tail after a comma ("The Bizzarro Agency, New York Real Estate Agents") goes, but partner
  // lists ("Zukerman, Lear, Murray & Brown", "Craig, Kelley and Faultless") and short credentials ("Braj Aggarwal, CPA") stay.
  const comma = name.match(/^([^,]{3,}),\s+(.+)$/)
  if (comma && !/&|\band\b/i.test(comma[2]) && comma[2].split(/\s+/).length >= 3) name = comma[1].trim()

  name = name.replace(/[\s,;:|-]+$/, '').trim()
  return hasName(name) ? name : original
}
