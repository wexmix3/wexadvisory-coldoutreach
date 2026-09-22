const OPT_OUT_OPENER = /^\W*(?:(?:no|stop|pass|remove)\b\s*(?:[.,!;:-]|$|(?:from|sent|to|subject):|on\s[^\n]{0,120}?\bwrote:|sent from my\b|-{2,}|_{3,})|no\s+thanks?\b|no\s+thank\s+you\b|not\s+interested\b|no\s+longer\s+interested\b|unsubscribe\b|remove\s+me\b|take\s+me\s+off\b)/i
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
  // Real Gmail snippet shape: the quoted reply header is glued straight onto the new text.
  // First live opt-out (2026-09-21) was exactly this and fell through as a plain reply.
  ['NO From: Max Wexley <max@send.wexadvisory.com> Sent: Monday, September 21, 2026 10:53 AM To: Appointments', '', true],
  ['No On Mon, Sep 21, 2026 at 10:53 AM Max Wexley <max@send.wexadvisory.com> wrote:', '', true],
  ['Stop Sent from my iPhone', '', true],
  ['no -----Original Message----- From: Max Wexley', '', true],
  ['Pass ________________________________ From: Max Wexley', '', true],
  // must NOT be opt-outs
  ['No idea From: Max Wexley <max@send.wexadvisory.com> Sent: Monday', '', false],
  ['No from what I can tell you already sell this, what is different?', '', false],
  ['Stop by our office Tuesday and we can talk', '', false],
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
