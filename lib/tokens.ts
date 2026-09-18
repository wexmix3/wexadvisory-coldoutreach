import { Prospect } from './types'
import { getIndustryHook } from './industry-hooks'

const CALENDLY_URL = process.env.CALENDLY_URL ?? 'https://calendly.com/maxwexley-wexadvisory/free-strategy-call'

export function renderTemplate(
  template: string,
  prospect: Prospect,
  unsubscribeUrl: string
): string {
  const firstName = prospect.contact_name?.split(' ')[0]
  const contactName = firstName || 'there'
  const contactGreeting = firstName ? `, ${firstName}` : ''
  const customIntro = prospect.custom_intro || getIndustryHook(prospect.industry)
  // pain_signal is a short Haiku phrase ("Manual quote requests and policy review intake")
  // written at enrichment time. Lowercase the first letter unless it's an acronym so it
  // reads mid-sentence.
  const rawPain = prospect.pain_signal?.trim().replace(/[.\s]+$/, '')
  const painSignal = rawPain
    ? (/^[A-Z]{2}/.test(rawPain) ? rawPain : rawPain[0].toLowerCase() + rawPain.slice(1))
    : 'scheduling, intake and follow-ups that still run by hand'
  return template
    .replace(/\{\{pain_signal\}\}/g, painSignal)
    .replace(/\{\{industry_lower\}\}/g, (prospect.industry ?? 'small businesses').toLowerCase())
    .replace(/\{\{business_name\}\}/g, prospect.business_name)
    .replace(/\{\{contact_name\}\}/g, contactName)
    .replace(/\{\{contact_greeting\}\}/g, contactGreeting)
    .replace(/\{\{industry\}\}/g, prospect.industry ?? 'your industry')
    .replace(/\{\{city\}\}/g, prospect.city ?? 'your city')
    .replace(/\{\{custom_intro\}\}/g, customIntro)
    .replace(/\{\{industry_hook\}\}/g, getIndustryHook(prospect.industry))
    .replace(/\{\{calendly_url\}\}/g, CALENDLY_URL)
    .replace(/\{\{unsubscribe_url\}\}/g, unsubscribeUrl)
    .replace(/\{\{prospect_id\}\}/g, prospect.id)
}
