const { supabaseAdmin, getTenantClient } = require('../config/supabase');
const whatsappService = require('./whatsapp');
const config = require('../config/environment');

class ReminderService {
  /**
   * Send a reminder for a specific appointment
   */
  async sendReminder(clinicId, appointmentId, reminderType = 'manual') {
    const tenant = getTenantClient(clinicId);

    // Fetch appointment with patient info
    const { data: appointment, error: apptError } = await tenant.getAppointmentById(appointmentId);

    if (apptError || !appointment) {
      return {
        success: false,
        error: 'Appointment not found',
      };
    }

    if (appointment.status === 'cancelled' || appointment.status === 'completed') {
      return {
        success: false,
        error: `Cannot send reminder for ${appointment.status} appointment`,
      };
    }

    const patient = appointment.patients;
    if (!patient?.phone_number) {
      return {
        success: false,
        error: 'Patient phone number not available',
      };
    }

    // Get clinic name
    const { data: clinicUser } = await supabaseAdmin
      .from('users')
      .select('clinic_name')
      .eq('clinic_id', clinicId)
      .limit(1)
      .single();

    const clinicName = clinicUser?.clinic_name || 'Your Clinic';

    // Format date and time for Saudi timezone
    const apptDate = new Date(appointment.appointment_date);
    const dateStr = apptDate.toLocaleDateString('en-SA', {
      timeZone: config.defaultTimezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const timeStr = apptDate.toLocaleTimeString('en-SA', {
      timeZone: config.defaultTimezone,
      hour: '2-digit',
      minute: '2-digit',
    });

    // Send WhatsApp message
    const result = await whatsappService.sendReminder(
      patient.phone_number,
      patient.full_name,
      dateStr,
      timeStr,
      clinicName,
      reminderType
    );

    // Log the reminder
    const logData = {
      appointment_id: appointmentId,
      patient_id: appointment.patient_id,
      reminder_type: reminderType,
      status: result.success ? 'sent' : 'failed',
      whatsapp_message_id: result.messageId || null,
      error_message: result.error || null,
      sent_at: new Date().toISOString(),
    };

    await tenant.createReminderLog(logData);

    // Update appointment reminder status
    const updateData = {};
    if (reminderType === '24h') {
      updateData.reminder_24h_sent = true;
    } else if (reminderType === '3h') {
      updateData.reminder_3h_sent = true;
    }
    if (Object.keys(updateData).length > 0) {
      await tenant.updateAppointment(appointmentId, updateData);
    }

    return {
      success: result.success,
      messageId: result.messageId,
      error: result.error,
    };
  }

  /**
   * Process scheduled 24-hour reminders
   * Finds appointments happening in ~24 hours and sends reminders
   */
  async processScheduledReminders24h() {
    console.log('[Cron] Processing 24h reminders...');

    const now = new Date();
    const in23h = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    const { data: appointments, error } = await supabaseAdmin
      .from('appointments')
      .select('id, clinic_id, patient_id, appointment_date, patients(full_name, phone_number)')
      .gte('appointment_date', in23h.toISOString())
      .lte('appointment_date', in25h.toISOString())
      .eq('status', 'scheduled')
      .eq('reminder_24h_sent', false)
      .eq('is_deleted', false);

    if (error) {
      console.error('[Cron] Error fetching 24h appointments:', error);
      return;
    }

    console.log(`[Cron] Found ${appointments?.length || 0} appointments for 24h reminders`);

    // Check subscription status for each clinic before sending
    const clinicSubscriptions = {};

    for (const appointment of appointments || []) {
      try {
        // Cache subscription check per clinic
        if (clinicSubscriptions[appointment.clinic_id] === undefined) {
          const { data: user } = await supabaseAdmin
            .from('users')
            .select('subscription_status')
            .eq('clinic_id', appointment.clinic_id)
            .eq('is_active', true)
            .limit(1)
            .single();

          clinicSubscriptions[appointment.clinic_id] =
            user?.subscription_status === 'active' || user?.subscription_status === 'trialing';
        }

        if (!clinicSubscriptions[appointment.clinic_id]) {
          console.log(`[Cron] Skipping clinic ${appointment.clinic_id} - no active subscription`);
          continue;
        }

        await this.sendReminder(appointment.clinic_id, appointment.id, '24h');
        // Small delay between sends to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (err) {
        console.error(`[Cron] Error sending 24h reminder for appointment ${appointment.id}:`, err.message);
      }
    }
  }

  /**
   * Process scheduled 3-hour reminders
   */
  async processScheduledReminders3h() {
    console.log('[Cron] Processing 3h reminders...');

    const now = new Date();
    const in2h30 = new Date(now.getTime() + 2.5 * 60 * 60 * 1000);
    const in3h30 = new Date(now.getTime() + 3.5 * 60 * 60 * 1000);

    const { data: appointments, error } = await supabaseAdmin
      .from('appointments')
      .select('id, clinic_id, patient_id, appointment_date, patients(full_name, phone_number)')
      .gte('appointment_date', in2h30.toISOString())
      .lte('appointment_date', in3h30.toISOString())
      .in('status', ['scheduled', 'confirmed'])
      .eq('reminder_3h_sent', false)
      .eq('is_deleted', false);

    if (error) {
      console.error('[Cron] Error fetching 3h appointments:', error);
      return;
    }

    console.log(`[Cron] Found ${appointments?.length || 0} appointments for 3h reminders`);

    const clinicSubscriptions = {};

    for (const appointment of appointments || []) {
      try {
        if (clinicSubscriptions[appointment.clinic_id] === undefined) {
          const { data: user } = await supabaseAdmin
            .from('users')
            .select('subscription_status')
            .eq('clinic_id', appointment.clinic_id)
            .eq('is_active', true)
            .limit(1)
            .single();

          clinicSubscriptions[appointment.clinic_id] =
            user?.subscription_status === 'active' || user?.subscription_status === 'trialing';
        }

        if (!clinicSubscriptions[appointment.clinic_id]) {
          continue;
        }

        await this.sendReminder(appointment.clinic_id, appointment.id, '3h');
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (err) {
        console.error(`[Cron] Error sending 3h reminder for appointment ${appointment.id}:`, err.message);
      }
    }
  }

  /**
   * Mark no-show appointments (past appointments that were not confirmed or completed)
   */
  async markNoShowAppointments() {
    console.log('[Cron] Marking no-show appointments...');

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('appointments')
      .update({ status: 'no_show', updated_at: new Date().toISOString() })
      .lt('appointment_date', oneHourAgo)
      .in('status', ['scheduled', 'confirmed'])
      .eq('is_deleted', false)
      .select('id');

    if (error) {
      console.error('[Cron] Error marking no-shows:', error);
    } else {
      console.log(`[Cron] Marked ${data?.length || 0} appointments as no-show`);
    }
  }
}

module.exports = new ReminderService();
