const { supabaseAdmin } = require('../config/supabase');

class AnalyticsService {
  /**
   * Get dashboard analytics for a clinic
   */
  async getDashboardStats(clinicId, dateFrom, dateTo) {
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const defaultTo = now.toISOString();
    const from = dateFrom || defaultFrom;
    const to = dateTo || defaultTo;

    const [
      totalAppointments,
      statusBreakdown,
      confirmationRate,
      reminderStats,
      recentActivity,
    ] = await Promise.all([
      this.getTotalAppointments(clinicId, from, to),
      this.getStatusBreakdown(clinicId, from, to),
      this.getConfirmationRate(clinicId, from, to),
      this.getReminderStats(clinicId, from, to),
      this.getRecentActivity(clinicId),
    ]);

    // Calculate attendance rate
    const completed = statusBreakdown.find((s) => s.status === 'completed')?.count || 0;
    const noShow = statusBreakdown.find((s) => s.status === 'no_show')?.count || 0;
    const pastTotal = completed + noShow;
    const attendanceRate = pastTotal > 0 ? Math.round((completed / pastTotal) * 100) : 0;

    // Calculate no-show rate
    const noShowRate = pastTotal > 0 ? Math.round((noShow / pastTotal) * 100) : 0;

    return {
      period: { from, to },
      totalAppointments,
      attendanceRate,
      noShowRate,
      confirmationRate,
      statusBreakdown,
      reminderStats,
      recentActivity,
    };
  }

  /**
   * Get total appointment count
   */
  async getTotalAppointments(clinicId, from, to) {
    const { count } = await supabaseAdmin
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .eq('is_deleted', false)
      .gte('appointment_date', from)
      .lte('appointment_date', to);

    return count || 0;
  }

  /**
   * Get appointment status breakdown
   */
  async getStatusBreakdown(clinicId, from, to) {
    const statuses = ['scheduled', 'confirmed', 'reschedule_requested', 'completed', 'no_show', 'cancelled'];
    const results = [];

    for (const status of statuses) {
      const { count } = await supabaseAdmin
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .eq('status', status)
        .eq('is_deleted', false)
        .gte('appointment_date', from)
        .lte('appointment_date', to);

      results.push({ status, count: count || 0 });
    }

    return results;
  }

  /**
   * Get confirmation rate
   */
  async getConfirmationRate(clinicId, from, to) {
    const { count: total } = await supabaseAdmin
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .eq('is_deleted', false)
      .gte('appointment_date', from)
      .lte('appointment_date', to);

    const { count: confirmed } = await supabaseAdmin
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .in('status', ['confirmed', 'completed'])
      .eq('is_deleted', false)
      .gte('appointment_date', from)
      .lte('appointment_date', to);

    return {
      total: total || 0,
      confirmed: confirmed || 0,
      rate: total > 0 ? Math.round(((confirmed || 0) / total) * 100) : 0,
    };
  }

  /**
   * Get reminder delivery stats
   */
  async getReminderStats(clinicId, from, to) {
    const { data: logs } = await supabaseAdmin
      .from('reminder_logs')
      .select('status, reminder_type')
      .eq('clinic_id', clinicId)
      .gte('sent_at', from)
      .lte('sent_at', to);

    const stats = {
      total_sent: 0,
      successful: 0,
      failed: 0,
      by_type: {
        '24h': { sent: 0, failed: 0 },
        '3h': { sent: 0, failed: 0 },
        manual: { sent: 0, failed: 0 },
      },
    };

    for (const log of logs || []) {
      stats.total_sent++;
      if (log.status === 'sent') {
        stats.successful++;
        if (stats.by_type[log.reminder_type]) {
          stats.by_type[log.reminder_type].sent++;
        }
      } else {
        stats.failed++;
        if (stats.by_type[log.reminder_type]) {
          stats.by_type[log.reminder_type].failed++;
        }
      }
    }

    stats.delivery_rate =
      stats.total_sent > 0 ? Math.round((stats.successful / stats.total_sent) * 100) : 0;

    return stats;
  }

  /**
   * Get recent activity feed
   */
  async getRecentActivity(clinicId, limit = 20) {
    const { data: logs } = await supabaseAdmin
      .from('reminder_logs')
      .select('*, patients(full_name), appointments(appointment_date, status)')
      .eq('clinic_id', clinicId)
      .order('sent_at', { ascending: false })
      .limit(limit);

    return logs || [];
  }

  /**
   * Get no-show analytics with trends
   */
  async getNoShowAnalytics(clinicId, months = 6) {
    const results = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);

      const { count: noShows } = await supabaseAdmin
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .eq('status', 'no_show')
        .eq('is_deleted', false)
        .gte('appointment_date', monthStart.toISOString())
        .lte('appointment_date', monthEnd.toISOString());

      const { count: total } = await supabaseAdmin
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .in('status', ['completed', 'no_show'])
        .eq('is_deleted', false)
        .gte('appointment_date', monthStart.toISOString())
        .lte('appointment_date', monthEnd.toISOString());

      results.push({
        month: monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        noShows: noShows || 0,
        total: total || 0,
        rate: total > 0 ? Math.round(((noShows || 0) / total) * 100) : 0,
      });
    }

    return results;
  }

  /**
   * Get patient-level no-show statistics
   */
  async getFrequentNoShows(clinicId, minNoShows = 2) {
    const { data } = await supabaseAdmin
      .from('appointments')
      .select('patient_id, patients(full_name, phone_number)')
      .eq('clinic_id', clinicId)
      .eq('status', 'no_show')
      .eq('is_deleted', false);

    if (!data) return [];

    // Count no-shows per patient
    const patientNoShows = {};
    for (const appt of data) {
      const pid = appt.patient_id;
      if (!patientNoShows[pid]) {
        patientNoShows[pid] = {
          patient_id: pid,
          full_name: appt.patients?.full_name,
          phone_number: appt.patients?.phone_number,
          no_show_count: 0,
        };
      }
      patientNoShows[pid].no_show_count++;
    }

    return Object.values(patientNoShows)
      .filter((p) => p.no_show_count >= minNoShows)
      .sort((a, b) => b.no_show_count - a.no_show_count);
  }
}

module.exports = new AnalyticsService();
