import { pollForUpdates } from './lib/poller';

export default {
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    const currentHour = new Date(event.scheduledTime).getUTCHours();
    console.log(`[AsuraTracker] Cron fired at UTC hour ${currentHour}`);

    try {
      const result = await pollForUpdates(env.DB, {
        RESEND_API_KEY: env.RESEND_API_KEY,
        NOTIFICATION_EMAIL: env.NOTIFICATION_EMAIL,
      });
      console.log(`[AsuraTracker] Poll complete: ${result.updatedSeries} series updated, ${result.notificationsSent} notifications sent`);
    } catch (error) {
      console.error('[AsuraTracker] Poll failed:', error);
    }
  },
};
