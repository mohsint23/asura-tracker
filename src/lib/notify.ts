import { Resend } from 'resend';

interface ChapterUpdate {
  seriesTitle: string;
  chapterNumber: number;
  readUrl: string;
}

export async function sendUpdateEmail(
  apiKey: string,
  fromEmail: string,
  toEmail: string,
  updates: ChapterUpdate[]
): Promise<void> {
  if (updates.length === 0) return;

  const resend = new Resend(apiKey);

  const listItems = updates
    .map(u => `- ${u.seriesTitle} — Chapter ${u.chapterNumber}\n  Read: ${u.readUrl}`)
    .join('\n');

  const subject = updates.length === 1
    ? `New Chapter: ${updates[0].seriesTitle} Ch. ${updates[0].chapterNumber}`
    : `${updates.length} New Chapters Available`;

  await resend.emails.send({
    from: fromEmail,
    to: toEmail,
    subject,
    text: `New chapters are out!\n\n${listItems}\n\nSent by AsuraTracker`,
  });
}
