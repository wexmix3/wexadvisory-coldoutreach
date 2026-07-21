import { getGmailAccessToken } from './gmail-auth';

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

export type DmarcAttachment = {
  messageId: string;
  filename: string;
  content: Buffer;
};

type GmailMessagePart = {
  filename?: string;
  mimeType?: string;
  body?: { attachmentId?: string; data?: string; size?: number };
  parts?: GmailMessagePart[];
};

function decodeBase64Url(data: string): Buffer {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

async function gmailFetch<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail API error (${path}): ${res.status} ${body}`);
  }
  return res.json() as Promise<T>;
}

// Lists message IDs from Google's DMARC report sender within the lookback
// window. Callers are expected to dedupe against already-processed IDs.
export async function listDmarcMessageIds(lookbackDays = 2): Promise<string[]> {
  const accessToken = await getGmailAccessToken();
  const q = encodeURIComponent(`from:noreply-dmarc-support@google.com newer_than:${lookbackDays}d`);
  const data = await gmailFetch<{ messages?: { id: string }[] }>(`/messages?q=${q}`, accessToken);
  return (data.messages ?? []).map((m) => m.id);
}

// Fetches the zip/gz XML attachment from a single DMARC report email.
// Returns null if the message has no recognizable attachment.
// Finds the first part (searching top-level payload, then nested parts —
// Google sends the DMARC report as a single-part message with the
// attachment directly on payload, but other senders may nest it) that
// looks like a report attachment.
function findAttachmentPart(payload?: GmailMessagePart): { filename: string; attachmentId: string } | null {
  if (payload?.filename && /\.(zip|gz|xml)$/i.test(payload.filename) && payload.body?.attachmentId) {
    return { filename: payload.filename, attachmentId: payload.body.attachmentId };
  }
  for (const part of payload?.parts ?? []) {
    const found = findAttachmentPart(part);
    if (found) return found;
  }
  return null;
}

export async function fetchDmarcAttachment(messageId: string): Promise<DmarcAttachment | null> {
  const accessToken = await getGmailAccessToken();
  const message = await gmailFetch<{ payload?: GmailMessagePart }>(`/messages/${messageId}`, accessToken);

  const attachmentPart = findAttachmentPart(message.payload);
  if (!attachmentPart) return null;

  const attachment = await gmailFetch<{ data: string }>(
    `/messages/${messageId}/attachments/${attachmentPart.attachmentId}`,
    accessToken
  );

  return {
    messageId,
    filename: attachmentPart.filename,
    content: decodeBase64Url(attachment.data),
  };
}

// Adds a label to mark a report email as ingested. Creates the label on
// first use. Belt-and-suspenders alongside the dmarc_processed_emails table.
export async function labelAsProcessed(messageId: string): Promise<void> {
  const accessToken = await getGmailAccessToken();
  const labelId = await getOrCreateLabel(accessToken, 'DMARC-Processed');
  await fetch(`${GMAIL_BASE}/messages/${messageId}/modify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ addLabelIds: [labelId] }),
  });
}

async function getOrCreateLabel(accessToken: string, name: string): Promise<string> {
  const list = await gmailFetch<{ labels?: { id: string; name: string }[] }>('/labels', accessToken);
  const existing = (list.labels ?? []).find((l) => l.name === name);
  if (existing) return existing.id;

  const res = await fetch(`${GMAIL_BASE}/labels`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, labelListVisibility: 'labelShow', messageListVisibility: 'show' }),
  });
  if (!res.ok) throw new Error(`Failed to create Gmail label: ${res.status} ${await res.text()}`);
  const created = await res.json();
  return created.id;
}
