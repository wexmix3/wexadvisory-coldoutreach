const HOOKS: Record<string, string> = {
  fitness:
    "Most fitness studios are still handling member follow-ups, class reminders, and lead nurture manually — AI can automate all of it and free up hours every week.",
  wellness:
    "Most wellness studios spend hours each week on tasks AI can handle automatically — appointment reminders, client check-ins, review requests, and more.",
  realestate:
    "Most real estate agents are manually following up on leads and managing their pipeline. AI can handle the repetitive parts and free up time for actual deals.",
  food:
    "Most restaurants are leaving money on the table with manual reservation follow-ups and loyalty touchpoints that AI can run automatically.",
  default:
    "Most small businesses are spending 5–10 hours a week on tasks AI can handle — and aren't sure where to start.",
}

export function getIndustryHook(industry: string | null): string {
  if (!industry) return HOOKS.default
  const n = industry.toLowerCase()
  if (/fitness|gym|crossfit|training|bootcamp|athletic|sport/.test(n)) return HOOKS.fitness
  if (/yoga|pilates|lagree|barre|wellness|meditation/.test(n)) return HOOKS.wellness
  if (/real.?estate|realt|broker|property/.test(n)) return HOOKS.realestate
  if (/restaurant|cafe|bar|food|dining|bistro|kitchen/.test(n)) return HOOKS.food
  return HOOKS.default
}
