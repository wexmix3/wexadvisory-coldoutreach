const OPT_OUT_OPENER = /^\W*(?:(?:no|stop|pass|remove)\b\s*(?:[.,!;:-]|$)|no\s+thanks?\b|no\s+thank\s+you\b|not\s+interested\b|no\s+longer\s+interested\b|unsubscribe\b|remove\s+me\b|take\s+me\s+off\b)/i
const OPT_OUT_PHRASE = /\b(unsubscribe|take me off|remove me from|stop emailing|do not (contact|email)|don't (contact|email))\b/i
const isOptOut = (subject, snippet) =>
  OPT_OUT_OPENER.test(snippet) || OPT_OUT_PHRASE.test(snippet) || OPT_OUT_PHRASE.test(subject)

const cases = [
  ['no', '', true],
  ['No thanks', '', true],
  ['no thanks.', '', true],
  ['No, we handle that internally.', '', true],
  ['Not interested, thanks', '', true],
  ['Please remove me from your list.', '', true],
  ['Unsubscribe', '', true],
  ['STOP', '', true],
  ['Do not email me again', '', true],
  ["Don't contact us.", '', true],
  ['Hi Max, please take me off this list', '', true],
  ['> On Fri, Max wrote:', 'unsubscribe', true],
  // must NOT be opt-outs
  ['Yes, tell me more', '', false],
  ['Sure, send the ideas over', '', false],
  ['No idea what you mean, but call me Tuesday', '', false],
  ['Nope, we already automated that but curious what else', '', false],
  ['Interesting, what would you automate first?', '', false],
  ['Can you send pricing?', '', false],
  ['Normally I delete these but this was specific, tell me more', '', false],
  ['Not sure I am the right person, try our ops lead', '', false],
]
let bad = 0
for (const [snippet, subject, want] of cases) {
  const got = isOptOut(subject, snippet)
  if (got !== want) { bad++; console.log(`FAIL want=${want} got=${got} :: "${snippet}"`) }
}
console.log(bad === 0 ? `all ${cases.length} cases pass` : `${bad} FAILURES`)
process.exit(bad === 0 ? 0 : 1)
