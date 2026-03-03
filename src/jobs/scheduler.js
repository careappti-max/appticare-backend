const cron = require('node-cron');
const reminderService = require('../services/reminder');

class Scheduler {
  constructor() {
    this.jobs = [];
  }

  /**
   * Start all scheduled jobs
   */
  start() {
    console.log('[Scheduler] Starting cron jobs...');

    // Process 24-hour reminders every 30 minutes
    const reminder24h = cron.schedule('*/30 * * * *', async () => {
      try {
        await reminderService.processScheduledReminders24h();
      } catch (err) {
        console.error('[Scheduler] 24h reminder job error:', err.message);
      }
    });
    this.jobs.push(reminder24h);

    // Process 3-hour reminders every 15 minutes
    const reminder3h = cron.schedule('*/15 * * * *', async () => {
      try {
        await reminderService.processScheduledReminders3h();
      } catch (err) {
        console.error('[Scheduler] 3h reminder job error:', err.message);
      }
    });
    this.jobs.push(reminder3h);

    // Mark no-show appointments every hour
    const noShowCheck = cron.schedule('0 * * * *', async () => {
      try {
        await reminderService.markNoShowAppointments();
      } catch (err) {
        console.error('[Scheduler] No-show check job error:', err.message);
      }
    });
    this.jobs.push(noShowCheck);

    // Check expired subscriptions daily at midnight (Saudi time = UTC+3)
    const subscriptionCheck = cron.schedule('0 21 * * *', async () => {
      try {
        await this.checkExpiredSubscriptions();
      } catch (err) {
        console.error('[Scheduler] Subscription check error:', err.message);
      }
    });
    this.jobs.push(subscriptionCheck);

    console.log('[Scheduler] All cron jobs started');
  }

  /**
   * Check and deactivate expired subscriptions
   */
  async checkExpiredSubscriptions() {
    console.log('[Scheduler] Checking expired subscriptions...');
    const { supabaseAdmin } = require('../config/supabase');

    const now = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('users')
      .update({
        subscription_status: 'expired',
        updated_at: now,
      })
      .in('subscription_status', ['active', 'trialing'])
      .lt('subscription_end', now)
      .select('id, email, clinic_id');

    if (error) {
      console.error('[Scheduler] Error checking subscriptions:', error);
    } else {
      console.log(`[Scheduler] Expired ${data?.length || 0} subscriptions`);
    }
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    console.log('[Scheduler] Stopping cron jobs...');
    for (const job of this.jobs) {
      job.stop();
    }
    this.jobs = [];
  }
}

module.exports = new Scheduler();
