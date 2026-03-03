const { createClient } = require('@supabase/supabase-js');
const config = require('./environment');

// Service role client - has full access, used for server-side operations
const supabaseAdmin = createClient(
  config.supabase.url || 'https://placeholder.supabase.co',
  config.supabase.serviceRoleKey || 'placeholder',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Create a tenant-scoped client that filters by clinic_id
function getTenantClient(clinicId) {
  return {
    // Patients
    async getPatients(options = {}) {
      const { page = 1, limit = 50, search } = options;
      let query = supabaseAdmin
        .from('patients')
        .select('*', { count: 'exact' })
        .eq('clinic_id', clinicId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .range((page - 1) * limit, page * limit - 1);

      if (search) {
        query = query.or(`full_name.ilike.%${search}%,phone_number.ilike.%${search}%`);
      }

      return query;
    },

    async getPatientById(patientId) {
      return supabaseAdmin
        .from('patients')
        .select('*')
        .eq('id', patientId)
        .eq('clinic_id', clinicId)
        .eq('is_deleted', false)
        .single();
    },

    async createPatient(data) {
      return supabaseAdmin
        .from('patients')
        .insert({ ...data, clinic_id: clinicId })
        .select()
        .single();
    },

    async updatePatient(patientId, data) {
      return supabaseAdmin
        .from('patients')
        .update(data)
        .eq('id', patientId)
        .eq('clinic_id', clinicId)
        .select()
        .single();
    },

    async deletePatient(patientId) {
      return supabaseAdmin
        .from('patients')
        .update({ is_deleted: true })
        .eq('id', patientId)
        .eq('clinic_id', clinicId);
    },

    // Appointments
    async getAppointments(options = {}) {
      const { page = 1, limit = 50, status, dateFrom, dateTo, patientId } = options;
      let query = supabaseAdmin
        .from('appointments')
        .select('*, patients(full_name, phone_number)', { count: 'exact' })
        .eq('clinic_id', clinicId)
        .eq('is_deleted', false)
        .order('appointment_date', { ascending: true })
        .range((page - 1) * limit, page * limit - 1);

      if (status) query = query.eq('status', status);
      if (dateFrom) query = query.gte('appointment_date', dateFrom);
      if (dateTo) query = query.lte('appointment_date', dateTo);
      if (patientId) query = query.eq('patient_id', patientId);

      return query;
    },

    async getAppointmentById(appointmentId) {
      return supabaseAdmin
        .from('appointments')
        .select('*, patients(full_name, phone_number)')
        .eq('id', appointmentId)
        .eq('clinic_id', clinicId)
        .eq('is_deleted', false)
        .single();
    },

    async createAppointment(data) {
      return supabaseAdmin
        .from('appointments')
        .insert({ ...data, clinic_id: clinicId })
        .select()
        .single();
    },

    async updateAppointment(appointmentId, data) {
      return supabaseAdmin
        .from('appointments')
        .update(data)
        .eq('id', appointmentId)
        .eq('clinic_id', clinicId)
        .select()
        .single();
    },

    async deleteAppointment(appointmentId) {
      return supabaseAdmin
        .from('appointments')
        .update({ is_deleted: true })
        .eq('id', appointmentId)
        .eq('clinic_id', clinicId);
    },

    // Reminder Logs
    async createReminderLog(data) {
      return supabaseAdmin
        .from('reminder_logs')
        .insert({ ...data, clinic_id: clinicId })
        .select()
        .single();
    },

    async getReminderLogs(options = {}) {
      const { page = 1, limit = 50, appointmentId } = options;
      let query = supabaseAdmin
        .from('reminder_logs')
        .select('*, appointments(appointment_date), patients(full_name, phone_number)', { count: 'exact' })
        .eq('clinic_id', clinicId)
        .order('sent_at', { ascending: false })
        .range((page - 1) * limit, page * limit - 1);

      if (appointmentId) query = query.eq('appointment_id', appointmentId);

      return query;
    },

    // Inbound Messages
    async createInboundMessage(data) {
      return supabaseAdmin
        .from('inbound_messages')
        .insert({ ...data, clinic_id: clinicId })
        .select()
        .single();
    },

    async getInboundMessages(options = {}) {
      const { page = 1, limit = 50 } = options;
      return supabaseAdmin
        .from('inbound_messages')
        .select('*', { count: 'exact' })
        .eq('clinic_id', clinicId)
        .order('received_at', { ascending: false })
        .range((page - 1) * limit, page * limit - 1);
    },
  };
}

module.exports = { supabaseAdmin, getTenantClient };
