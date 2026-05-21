import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

const client = new Anthropic()

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params

  const { data: prospect, error } = await supabaseAdmin
    .from('prospects')
    .select('business_name, website, industry, city, state')
    .eq('id', id)
    .single()

  if (error || !prospect) {
    return NextResponse.json({ error: 'Prospect not found' }, { status: 404 })
  }

  const { business_name, website, industry, city, state } = prospect
  const location = [city, state].filter(Boolean).join(', ')

  const prompt = `You are writing a cold email opening line for Max Wexley, an AI consultant at Wex Advisory.

Write a single, specific, 1–2 sentence opening that:
- References something concrete and observable about this specific business (their location, industry niche, or what their type of business commonly struggles with)
- Feels like it was written by a human who did 2 minutes of research, not a robot
- Is NOT generic — don't say "I came across your business" or "I noticed your website"
- Sets up an offer around either competitive analysis OR workflow automation
- Is conversational, not salesy

Business details:
- Name: ${business_name}
- Industry: ${industry ?? 'unknown'}
- Location: ${location || 'unknown'}
- Website: ${website ?? 'not available'}

Reply with ONLY the opening sentence(s). No subject line, no greeting, no signature. Just the hook.`

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }],
    })

    const intro = (message.content[0] as { type: string; text: string }).text.trim()

    await supabaseAdmin
      .from('prospects')
      .update({ custom_intro: intro })
      .eq('id', id)

    return NextResponse.json({ intro })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Claude error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
