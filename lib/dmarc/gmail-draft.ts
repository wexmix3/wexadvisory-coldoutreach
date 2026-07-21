// Creates a Gmail draft for the weekly DMARC summary. Never sends —
// Max reviews and sends manually. Ported from ai-audit's create-draft.ts.
import { getGmailAccessToken } from './gmail-auth';

function buildMimeMessage(params: { to: string; from: string; subject: string; bodyHtml: string }): string {
  const { to, from, subject, bodyHtml } = params;
  const message = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    bodyHtml,
  ].join('\r\n');

  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function createDmarcSummaryDraft(params: { to: string; subject: string; bodyHtml: string }): Promise<string> {
  const accessToken = await getGmailAccessToken();

  const raw = buildMimeMessage({
    to: params.to,
    from: 'Max Wexley <maxwexley@wexadvisory.com>',
    subject: params.subject,
    bodyHtml: params.bodyHtml,
  });

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { raw } }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail draft creation failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as { id: string };
  return data.id;
}
