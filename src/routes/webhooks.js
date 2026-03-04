const express = require('express');
const config = require('../config/environment');
const { supabaseAdmin } = require('../config/supabase');
const whatsappService = require('../services/whatsapp');
const moyasarService = require('../services/moyasar');

const router = express.Router();

/**
 * GET /webhooks/whatsapp
 * WhatsApp webhook verification
 * Supports both Meta (hub.verify_token) and Twilio (simple GET health check)
 */
router.get('/whatsapp', (req, res) => {
  // Meta verification flow
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    console.log('WhatsApp webhook verified (Meta)');
    return res.status(200).send(challenge);
  }

  // Twilio / general health check
  return res.status(200).json({ status: 'ok', provider: 'twilio' });
});

/**
 * POST /webhooks/whatsapp
 * Receive incoming WhatsApp messages (replies to reminders)
 * Supports Twilio format (form-encoded: Body, From, To, MessageSid, ProfileName)
 */
router.post('/whatsapp', async (req, res) => {
  try {
    // Respond 200 quickly (required by both Meta and Twilio)
    res.status(200).type('text/xml').send('<Response></Response>');

    const parsed = whatsappService.parseIncomingMessage(req.body);
    if (!parsed) return;

    console.log(`[WhatsApp] Incoming message from ${parsed.from}: action=${parsed.action}`);

    // Mark message as read
    await whatsappService.markAsRead(parsed.messageId);

    // Find the patient by phone number to determine clinic
    const formattedPhone = whatsappService.formatPhoneNumber(parsed.from);
    const phoneVariants = [
      parsed.from,
      formattedPhone,
      `+${formattedPhone}`,
      `0${formattedPhone.slice(3)}`, // Local format
    ];

    const { data: patients } = await supabaseAdmin
      .from('patients')
      .select('id, clinic_id, full_name, phone_number')
      .or(phoneVariants.map((p) => `phone_number.eq.${p}`).join(','))
      .eq('is_deleted', false);

    if (!patients || patients.length === 0) {
      console.log(`[WhatsApp] No patient found for phone: ${parsed.from}`);
      return;
    }

    // Process for each matching patient (could be in multiple clinics)
    for (const patient of patients) {
      // Log the inbound message
      await supabaseAdmin.from('inbound_messages').insert({
        clinic_id: patient.clinic_id,
        patient_id: patient.id,
        from_phone: parsed.from,
        message_type: parsed.type,
        message_content: parsed.text || parsed.buttonTitle || null,
        whatsapp_message_id: parsed.messageId,
        action: parsed.action || null,
        raw_payload: req.body,
        received_at: new Date().toISOString(),
      });

      // If there's an action (confirmed or reschedule), update the latest appointment
      if (parsed.action) {
        // Find the most recent scheduled/pending appointment for this patient
        const { data: appointments } = await supabaseAdmin
          .from('appointments')
          .select('id, status, appointment_date')
          .eq('clinic_id', patient.clinic_id)
          .eq('patient_id', patient.id)
          .in('status', ['scheduled', 'confirmed'])
          .eq('is_deleted', false)
          .order('appointment_date', { ascending: true })
          .limit(1);

        if (appointments && appointments.length > 0) {
          const appointment = appointments[0];
          const newStatus = parsed.action; // 'confirmed' or 'reschedule_requested'

          await supabaseAdmin
            .from('appointments')
            .update({
              status: newStatus,
              updated_at: new Date().toISOString(),
            })
            .eq('id', appointment.id);

          console.log(
            `[WhatsApp] Updated appointment ${appointment.id} to ${newStatus} for patient ${patient.full_name}`
          );

          // Send confirmation response
          if (parsed.action === 'confirmed') {
            await whatsappService.sendTextMessage(
              parsed.from,
              `✅ شكراً ${patient.full_name}! تم تأكيد موعدك.\n\nThank you ${patient.full_name}! Your appointment has been confirmed.`
            );
          } else if (parsed.action === 'reschedule_requested') {
            await whatsappService.sendTextMessage(
              parsed.from,
              `🔄 شكراً ${patient.full_name}! تم استلام طلب إعادة الجدولة. سيتواصل معك فريق العيادة قريباً.\n\nThank you ${patient.full_name}! Your reschedule request has been received. The clinic team will contact you soon.`
            );
          }
        }
      }
    }
  } catch (err) {
    console.error('[WhatsApp] Webhook processing error:', err);
    // Don't return error - we already sent 200
  }
});

/**
 * POST /webhooks/moyasar
 * Receive Moyasar payment webhooks
 */
router.post('/moyasar', async (req, res) => {
  try {
    // Verify webhook signature if configured
    const signature = req.headers['x-moyasar-signature'];
    if (config.moyasar.webhookSecret && signature) {
      const isValid = moyasarService.verifyWebhookSignature(req.body, signature);
      if (!isValid) {
        console.warn('[Moyasar] Invalid webhook signature');
        return res.status(401).json({ error: 'Unauthorized', message: 'Invalid signature' });
      }
    }

    const result = await moyasarService.processPaymentWebhook(req.body);

    console.log(`[Moyasar] Webhook processed: ${JSON.stringify(result)}`);

    res.json({ status: 'processed', ...result });
  } catch (err) {
    console.error('[Moyasar] Webhook error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Webhook processing failed' });
  }
});

module.exports = router;
