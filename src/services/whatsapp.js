const config = require('../config/environment');

class WhatsAppService {
  constructor() {
    this.client = null;
    this.fromNumber = null;
    this._initialized = false;
  }

  /**
   * Lazy-initialize Twilio client (only when credentials are available)
   */
  _ensureClient() {
    if (this._initialized) return !!this.client;

    const { accountSid, authToken, whatsappNumber } = config.twilio || {};

    if (accountSid && authToken) {
      const twilio = require('twilio');
      this.client = twilio(accountSid, authToken);
      this.fromNumber = whatsappNumber || 'whatsapp:+14155238886'; // Twilio sandbox default
      this._initialized = true;
      return true;
    }

    this._initialized = true;
    console.warn('[WhatsApp] Twilio credentials not configured. WhatsApp messaging disabled.');
    return false;
  }

  /**
   * Send a WhatsApp message for appointment reminders
   */
  async sendReminder(phoneNumber, patientName, appointmentDate, appointmentTime, clinicName, reminderType) {
    if (!this._ensureClient()) {
      return { success: false, error: 'WhatsApp not configured' };
    }

    const formattedPhone = this.formatPhoneNumber(phoneNumber);
    const messageBody = this.buildReminderMessage(
      patientName,
      appointmentDate,
      appointmentTime,
      clinicName,
      reminderType
    );

    // Add reply instructions (text-based for Twilio compatibility)
    const fullMessage =
      messageBody +
      '\n\n' +
      'Reply *1* to Confirm | Reply *2* to Reschedule\n' +
      'أرسل *1* للتأكيد | أرسل *2* لإعادة الجدولة';

    try {
      const message = await this.client.messages.create({
        from: this.fromNumber,
        to: `whatsapp:${formattedPhone}`,
        body: fullMessage,
      });

      return {
        success: true,
        messageId: message.sid,
        whatsappId: formattedPhone,
      };
    } catch (error) {
      console.error('WhatsApp send error:', error.message);
      return {
        success: false,
        error: error.message,
        errorCode: error.code,
      };
    }
  }

  /**
   * Send a plain text message via WhatsApp
   */
  async sendTextMessage(phoneNumber, text) {
    if (!this._ensureClient()) {
      return { success: false, error: 'WhatsApp not configured' };
    }

    const formattedPhone = this.formatPhoneNumber(phoneNumber);

    try {
      const message = await this.client.messages.create({
        from: this.fromNumber,
        to: `whatsapp:${formattedPhone}`,
        body: text,
      });

      return {
        success: true,
        messageId: message.sid,
      };
    } catch (error) {
      console.error('WhatsApp text send error:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Mark a message as read (no-op for Twilio — handled automatically)
   */
  async markAsRead(messageId) {
    return { success: true };
  }

  /**
   * Build the reminder message body (bilingual Arabic + English)
   */
  buildReminderMessage(patientName, appointmentDate, appointmentTime, clinicName, reminderType) {
    const timeLabel = reminderType === '24h' ? 'tomorrow' : 'in 3 hours';

    return (
      `مرحباً ${patientName} 👋\n\n` +
      `لديك موعد ${timeLabel === 'tomorrow' ? 'غداً' : 'بعد 3 ساعات'} في ${clinicName}.\n` +
      `📅 التاريخ: ${appointmentDate}\n` +
      `🕐 الوقت: ${appointmentTime}\n\n` +
      `---\n\n` +
      `Hello ${patientName} 👋\n\n` +
      `You have an appointment ${timeLabel} at ${clinicName}.\n` +
      `📅 Date: ${appointmentDate}\n` +
      `🕐 Time: ${appointmentTime}`
    );
  }

  /**
   * Format phone number to international format (Saudi Arabia)
   * Returns format: +966XXXXXXXXX
   */
  formatPhoneNumber(phone) {
    let cleaned = phone.replace(/[\s\-()]/g, '');

    if (cleaned.startsWith('05')) {
      cleaned = '+966' + cleaned.substring(1);
    } else if (cleaned.startsWith('5') && cleaned.length === 9) {
      cleaned = '+966' + cleaned;
    } else if (cleaned.startsWith('966')) {
      cleaned = '+' + cleaned;
    } else if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }

    return cleaned;
  }

  /**
   * Parse incoming Twilio WhatsApp webhook payload
   * Twilio sends form-encoded data with Body, From, To, MessageSid, etc.
   */
  parseIncomingMessage(body) {
    try {
      if (!body || !body.Body) {
        return null;
      }

      const result = {
        messageId: body.MessageSid || body.SmsSid,
        from: body.From ? body.From.replace('whatsapp:', '') : null,
        timestamp: new Date().toISOString(),
        contactName: body.ProfileName || null,
        type: 'text',
        text: body.Body ? body.Body.trim() : null,
      };

      // Parse reply actions: 1 = confirm, 2 = reschedule
      if (result.text === '1') {
        result.action = 'confirmed';
      } else if (result.text === '2') {
        result.action = 'reschedule_requested';
      }

      return result;
    } catch (error) {
      console.error('Error parsing WhatsApp message:', error);
      return null;
    }
  }

  /**
   * Validate Twilio webhook signature for security
   */
  validateWebhookSignature(req) {
    if (!this._ensureClient()) return true;

    try {
      const twilio = require('twilio');
      const authToken = config.twilio.authToken;
      const twilioSignature = req.headers['x-twilio-signature'];
      const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

      return twilio.validateRequest(authToken, twilioSignature, url, req.body);
    } catch (error) {
      console.error('Twilio signature validation error:', error.message);
      return false;
    }
  }
}

module.exports = new WhatsAppService();
