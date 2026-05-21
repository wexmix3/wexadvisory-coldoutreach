import { Prospect } from './types'

export function renderTemplate(
  template: string,
  prospect: Prospect,
  unsubscribeUrl: string
): string {
  const contactName = prospect.contact_name?.split(' ')[0] || 'there'
  // custom_intro may not exist on older DB rows — fall back to empty string
  const customIntro = (prospect as Prospect & { custom_intro?: string }).custom_intro ?? ''
  return template
    .replace(/\{\{business_name\}\}/g, prospect.business_name)
    .replace(/\{\{contact_name\}\}/g, contactName)
    .replace(/\{\{industry\}\}/g, prospect.industry ?? 'your industry')
    .replace(/\{\{city\}\}/g, prospect.city ?? 'your city')
    .replace(/\{\{custom_intro\}\}/g, customIntro)
    .replace(/\{\{unsubscribe_url\}\}/g, unsubscribeUrl)
}
