const axios = require('axios');
const config = require('../config/environment');

class WhatsAppService {
  constructor() {
    this.apiUrl = config.whatsapp.apiUrl;
    this.phoneNumberId = config.whatsapp.phoneNumberId;
    this.accessToken = config.whatsapp.accessToken;
  }

  /**
   * Send a WhatsApp template message for appointment reminders
   */
  async sendReminder(phoneNumber, patientName, appointmentDate, appointmentTime, clinicName, reminderType) {
    const formattedPhone = this.formatPhoneNumber(phoneNumber);

    const messageBody = this.buildReminderMessage(
      patientName,
      appointmentDate,
      appointmentTime,
      clinicName,
      reminderType
    );

    try {
      const response = await axios.post(
        `${this.apiUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: formattedPhone,
          type: 'interactive',
          interactive: {
            type: 'button',
            header: {
              type: 'text',
              text: '🏥 ApptiCare - Appointment Reminder',
            },
            body: {
              text: messageBody,
            },
            footer: {
              text: 'Powered by ApptiCare',
            },
            action: {
              buttons: [
                {
                  type: 'reply',
                  reply: {
                    id: 'confirm_appointment',
                    title: '✅ Confirm',
                  },
                },
                {
                  type: 'reply',
                  reply: {
                    id: 'reschedule_appointment',
                    title: '🔄 Reschedule',
                  },
                },
              ],
            },
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: true,
        messageId: response.data.messages?.[0]?.id,
        whatsappId: response.data.contacts?.[0]?.wa_id,
      };
    } catch (error) {
      console.error('WhatsApp send error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
        errorCode: error.response?.data?.error?.code,
      };
    }
  }

  /**
   * Send a plain text message
   */
  async sendTextMessage(phoneNumber, text) {
    const formattedPhone = this.formatPhoneNumber(phoneNumber);

    try {
      const response = await axios.post(
        `${this.apiUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: formattedPhone,
          type: 'text',
          text: { body: text },
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: true,
        messageId: response.data.messages?.[0]?.id,
      };
    } catch (error) {
      console.error('WhatsApp text send error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  /**
   * Mark a message as read
   */
  async markAsRead(messageId) {
    try {
      await axios.post(
        `${this.apiUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      return { success: true };
    } catch (error) {
      console.error('WhatsApp mark read error:', error.message);
      return { success: false };
    }
  }

  /**
   * Build the reminder message body
   */
  buildReminderMessage(patientName, appointmentDate, appointmentTime, clinicName, reminderType) {
    const timeLabel = reminderType === '24h' ? 'tomorrow' : 'in 3 hours';

    // Arabic + English bilingual message
    return (
      `مرحباً ${patientName} 👋\n\n` +
      `لديك موعد ${timeLabel === 'tomorrow' ? 'غداً' : 'بعد 3 ساعات'} في ${clinicName}.\n` +
      `📅 التاريخ: ${appointmentDate}\n` +
      `🕐 الوقت: ${appointmentTime}\n\n` +
      `---\n\n` +
      `Hello ${patientName} 👋\n\n` +
      `You have an appointment ${timeLabel} at ${clinicName}.\n` +
      `📅 Date: ${appointmentDate}\n` +
      `🕐 Time: ${appointmentTime}\n\n` +
      `Please confirm or request to reschedule:`
    );
  }

  /**
   * Format phone number to international format (Saudi Arabia)
   */
  formatPhoneNumber(phone) {
    let cleaned = phone.replace(/[\s\-()]/g, '');

    // Convert local Saudi format to international
    if (cleaned.startsWith('05')) {
      cleaned = '966' + cleaned.substring(1);
    } else if (cleaned.startsWith('5') && cleaned.length === 9) {
      cleaned = '966' + cleaned;
    } else if (cleaned.startsWith('+966')) {
      cleaned = cleaned.substring(1);
    }

    return cleaned;
  }

  /**
   * Parse incoming webhook payload from Meta
   */
  parseIncomingMessage(body) {
    try {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      if (!value?.messages?.[0]) {
        return null;
      }

      const message = value.messages[0];
      const contact = value.contacts?.[0];

      const result = {
        messageId: message.id,
        from: message.from,
        timestamp: message.timestamp,
        contactName: contact?.profile?.name,
        type: message.type,
      };

      // Handle interactive button replies
      if (message.type === 'interactive' && message.interactive?.type === 'button_reply') {
        result.buttonId = message.interactive.button_reply.id;
        result.buttonTitle = message.interactive.button_reply.title;

        if (result.buttonId === 'confirm_appointment') {
          result.action = 'confirmed';
        } else if (result.buttonId === 'reschedule_appointment') {
          result.action = 'reschedule_requested';
        }
      }

      // Handle text messages (fallback: 1 = confirm, 2 = reschedule)
      if (message.type === 'text') {
        result.text = message.text?.body?.trim();

        if (result.text === '1') {
          result.action = 'confirmed';
        } else if (result.text === '2') {
          result.action = 'reschedule_requested';
        }
      }

      return result;
    } catch (error) {
      console.error('Error parsing WhatsApp message:', error);
      return null;
    }
  }
}

module.exports = new WhatsAppService();
