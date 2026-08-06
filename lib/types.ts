export type ProspectStatus =
  | 'new'
  | 'queued'
  | 'initial_sent'
  | 'followup1_sent'
  | 'followup2_sent'
  | 'replied'
  | 'unsubscribed'
  | 'bounced'
  | 'exhausted'

export interface Prospect {
  id: string
  business_name: string
  contact_name: string | null
  email: string
  website: string | null
  industry: string | null
  city: string | null
  state: string | null
  google_place_id: string | null
  hunter_confidence: number | null
  status: ProspectStatus
  notes: string | null
  initial_sent_at: string | null
  followup1_sent_at: string | null
  followup2_sent_at: string | null
  replied_at: string | null
  created_at: string
  // Enrichment fields
  custom_intro: string | null
  fit_score: number | null
  pain_signal: string | null
  enrichment_status: string | null
  enriched_at: string | null
}

export interface EmailLog {
  id: string
  prospect_id: string
  template_type: 'initial' | 'followup1' | 'followup2'
  variant: number | null
  subject: string
  body_html: string
  resend_id: string | null
  sent_at: string
  status: 'sent' | 'failed' | 'bounced'
  reply_category: 'interested' | 'wrong_person' | 'not_now' | 'not_interested' | 'unsubscribe' | null
  opened_at: string | null
  clicked_at: string | null
}

export interface Template {
  id: string
  type: 'initial' | 'followup1' | 'followup2'
  variant: number
  subject: string
  body_html: string
  updated_at: string
}
