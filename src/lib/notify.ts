import { Resend } from 'resend';

interface ChapterUpdate {
  seriesTitle: string;
  chapterNumber: number;
  readUrl: string;
  coverUrl?: string;
}

export { type ChapterUpdate };

function buildHtml(updates: ChapterUpdate[]): string {
  const chapterRows = updates.map(u => `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #2a2a3e;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            ${u.coverUrl ? `<td width="50" style="padding-right: 12px; vertical-align: top;">
              <img src="${u.coverUrl}" alt="${u.seriesTitle}" width="50" height="67" style="border-radius: 4px; object-fit: cover; display: block;" />
            </td>` : ''}
            <td style="vertical-align: middle;">
              <p style="margin: 0; font-size: 15px; font-weight: 600; color: #e0e0e0;">${u.seriesTitle}</p>
              <p style="margin: 4px 0 0; font-size: 13px; color: #a855f7;">Chapter ${u.chapterNumber}</p>
            </td>
            <td width="80" style="text-align: right; vertical-align: middle;">
              <a href="${u.readUrl}" style="display: inline-block; padding: 6px 14px; background: #a855f7; color: #ffffff; text-decoration: none; border-radius: 4px; font-size: 13px; font-weight: 600;">Read</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #0a0a0f;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table cellpadding="0" cellspacing="0" border="0" width="500" style="max-width: 500px;">

          <!-- Header -->
          <tr>
            <td style="text-align: center; padding-bottom: 32px;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #a855f7; letter-spacing: -0.5px;">ASURA SCANS</h1>
              <p style="margin: 6px 0 0; font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 1px;">New Chapter Alert</p>
            </td>
          </tr>

          <!-- Content Card -->
          <tr>
            <td style="background-color: #16161e; border-radius: 12px; padding: 24px;">
              <p style="margin: 0 0 16px; font-size: 15px; color: #999;">
                ${updates.length === 1 ? 'A new chapter just dropped:' : `${updates.length} new chapters just dropped:`}
              </p>

              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                ${chapterRows}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="text-align: center; padding-top: 24px;">
              <p style="margin: 0; font-size: 12px; color: #444;">
                Sent by <a href="https://asurascans.com" style="color: #a855f7; text-decoration: none;">Asura Scans</a> Tracker
              </p>
              <p style="margin: 8px 0 0; font-size: 11px; color: #333;">
                You're receiving this because you subscribed to release notifications.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendUpdateEmail(
  apiKey: string,
  fromEmail: string,
  toEmail: string,
  updates: ChapterUpdate[]
): Promise<void> {
  if (updates.length === 0) return;

  const resend = new Resend(apiKey);

  const subject = updates.length === 1
    ? `New Chapter: ${updates[0].seriesTitle} Ch. ${updates[0].chapterNumber}`
    : `${updates.length} New Chapters Available`;

  const textFallback = updates
    .map(u => `${u.seriesTitle} — Chapter ${u.chapterNumber}\n${u.readUrl}`)
    .join('\n\n');

  await resend.emails.send({
    from: fromEmail,
    to: toEmail,
    subject,
    html: buildHtml(updates),
    text: `New chapters are out!\n\n${textFallback}\n\nSent by Asura Scans Tracker`,
  });
}
