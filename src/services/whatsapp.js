const axios = require('axios');
const config = require('../config/environment');

class WhatsAppService {
  constructor() {
    this._initialized = false;
    this._client = null;
  }

  /**
   * Lazy-initialize Green API client (only when credentials are available)
   */
  _ensureClient() {
    if (this._initialized) return !!this._client;

    const { apiUrl, idInstance, apiTokenInstance } = config.greenApi || {};

    if (apiUrl && idInstance && apiTokenInstance) {
      this._client = { apiUrl, idInstance, apiTokenInstance };
      this._initialized = true;
      console.log('[WhatsApp] Green API initialized successfully');
      return true;
    }

    this._initialized = true;
    console.warn('[WhatsApp] Green API credentials not configured. WhatsApp messaging disabled.');
    return false;
  }

  /**
   * Build the Green API endpoint URL
   */
  _buildUrl(method) {
    const { apiUrl, idInstance, apiTokenInstance } = this._client;
    return `${apiUrl}/waInstance${idInstance}/${method}/${apiTokenInstance}`;
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

    // Add reply instructions
    const fullMessage =
      messageBody +
      '\n\n' +
      'Reply *1* to Confirm | Reply *2* to Reschedule\n' +
      'أرسل *1* للتأكيد | أرسل *2* لإعادة الجدولة';

    try {
      // Green API uses phone@c.us format (without + prefix)
      const chatId = formattedPhone.replace('+', '') + '@c.us';

      const response = await axios.post(this._buildUrl('sendMessage'), {
        chatId,
        message: fullMessage,
      }, {
        timeout: 15000,
        headers: { 'Content-Type': 'application/json' },
      });

      return {
        success: true,
        messageId: response.data.idMessage,
        whatsappId: formattedPhone,
      };
    } catch (error) {
      console.error('WhatsApp send error:', error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        errorCode: error.response?.status,
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
      const chatId = formattedPhone.replace('+', '') + '@c.us';

      const response = await axios.post(this._buildUrl('sendMessage'), {
        chatId,
        message: text,
      }, {
        timeout: 15000,
        headers: { 'Content-Type': 'application/json' },
      });

      return {
        success: true,
        messageId: response.data.idMessage,
      };
    } catch (error) {
      console.error('WhatsApp text send error:', error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Mark a message as read via Green API
   */
  async markAsRead(chatId, messageId) {
    if (!this._ensureClient()) return { success: true };

    try {
      await axios.post(this._buildUrl('readChat'), {
        chatId,
      }, {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' },
      });
      return { success: true };
    } catch (error) {
      console.error('WhatsApp markAsRead error:', error.message);
      return { success: false };
    }
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
    } else if (cleaned.startsWith('00966')) {
      cleaned = '+' + cleaned.substring(2);
    } else if (cleaned.startsWith('966')) {
      cleaned = '+' + cleaned;
    } else if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }

    return cleaned;
  }

  /**
   * Parse incoming Green API webhook payload
   * Green API sends JSON with typeWebhook, senderData, messageData, etc.
   * Also supports legacy Twilio format for backward compatibility.
   */
  parseIncomingMessage(body) {
    try {
      // Handle Green API webhook format
      if (body.typeWebhook === 'incomingMessageReceived') {
        const senderData = body.senderData || {};
        const messageData = body.messageData || {};
        const textMessage = messageData.textMessageData || messageData.extendedTextMessageData;

        if (!textMessage) return null;

        const text = textMessage.textMessage || textMessage.text || '';

        const result = {
          messageId: body.idMessage,
          from: senderData.chatId ? senderData.chatId.replace('@c.us', '') : null,
          timestamp: body.timestamp ? new Date(body.timestamp * 1000).toISOString() : new Date().toISOString(),
          contactName: senderData.senderName || null,
          type: 'text',
          text: text.trim(),
          chatId: senderData.chatId || null,
        };

        // Parse reply actions: 1 = confirm, 2 = reschedule
        if (result.text === '1') {
          result.action = 'confirmed';
        } else if (result.text === '2') {
          result.action = 'reschedule_requested';
        }

        return result;
      }

      // Handle legacy Twilio format (form-encoded: Body, From, MessageSid)
      if (body.Body !== undefined) {
        const result = {
          messageId: body.MessageSid || body.SmsSid,
          from: body.From ? body.From.replace('whatsapp:', '') : null,
          timestamp: new Date().toISOString(),
          contactName: body.ProfileName || null,
          type: 'text',
          text: body.Body ? body.Body.trim() : null,
        };

        if (result.text === '1') {
          result.action = 'confirmed';
        } else if (result.text === '2') {
          result.action = 'reschedule_requested';
        }

        return result;
      }

      return null;
    } catch (error) {
      console.error('Error parsing WhatsApp message:', error);
      return null;
    }
  }

  /**
   * Validate webhook signature (Green API uses instance-specific URLs, no signature needed)
   */
  validateWebhookSignature(req) {
    return true;
  }
}

module.exports = new WhatsAppService();
