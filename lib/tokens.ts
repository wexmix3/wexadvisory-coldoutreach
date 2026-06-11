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
  return template
    .replace(/\{\{business_name\}\}/g, prospect.business_name)
    .replace(/\{\{contact_name\}\}/g, contactName)
    .replace(/\{\{contact_greeting\}\}/g, contactGreeting)
    .replace(/\{\{industry\}\}/g, prospect.industry ?? 'your industry')
    .replace(/\{\{city\}\}/g, prospect.city ?? 'your city')
    .replace(/\{\{custom_intro\}\}/g, customIntro)
    .replace(/\{\{industry_hook\}\}/g, getIndustryHook(prospect.industry))
    .replace(/\{\{calendly_url\}\}/g, CALENDLY_URL)
    .replace(/\{\{unsubscribe_url\}\}/g, unsubscribeUrl)
}
