const axios = require('axios');
const crypto = require('crypto');
const config = require('../config/environment');
const { supabaseAdmin } = require('../config/supabase');

class MoyasarService {
  constructor() {
    this.baseUrl = 'https://api.moyasar.com/v1';
    this.secretKey = config.moyasar.secretKey;
    this.webhookSecret = config.moyasar.webhookSecret;
  }

  /**
   * Verify Moyasar webhook signature
   */
  verifyWebhookSignature(payload, signature) {
    if (!this.webhookSecret) {
      console.warn('Moyasar webhook secret not configured, skipping verification');
      return true;
    }

    const computedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature || '', 'utf8'),
      Buffer.from(computedSignature, 'utf8')
    );
  }

  /**
   * Process subscription payment webhook
   */
  async processPaymentWebhook(event) {
    const { type, data } = event;

    switch (type) {
      case 'payment_paid':
        return this.handlePaymentPaid(data);
      case 'payment_failed':
        return this.handlePaymentFailed(data);
      case 'payment_refunded':
        return this.handlePaymentRefunded(data);
      default:
        console.log(`Unhandled Moyasar event type: ${type}`);
        return { processed: false, reason: 'Unhandled event type' };
    }
  }

  /**
   * Handle successful payment - activate subscription
   */
  async handlePaymentPaid(paymentData) {
    const clinicId = paymentData.metadata?.clinic_id;
    const planType = paymentData.metadata?.plan_type || 'monthly';

    if (!clinicId) {
      console.error('Payment webhook missing clinic_id in metadata');
      return { processed: false, reason: 'Missing clinic_id' };
    }

    // Calculate subscription end date based on plan
    const now = new Date();
    let subscriptionEnd;
    if (planType === 'yearly') {
      subscriptionEnd = new Date(now.setFullYear(now.getFullYear() + 1));
    } else {
      subscriptionEnd = new Date(now.setMonth(now.getMonth() + 1));
    }

    // Update user subscription status
    const { error } = await supabaseAdmin
      .from('users')
      .update({
        subscription_status: 'active',
        subscription_plan: planType,
        subscription_start: new Date().toISOString(),
        subscription_end: subscriptionEnd.toISOString(),
        moyasar_payment_id: paymentData.id,
        updated_at: new Date().toISOString(),
      })
      .eq('clinic_id', clinicId);

    if (error) {
      console.error('Error updating subscription:', error);
      return { processed: false, reason: 'Database update failed' };
    }

    // Log the payment
    await supabaseAdmin.from('payment_logs').insert({
      clinic_id: clinicId,
      payment_id: paymentData.id,
      amount: paymentData.amount / 100, // Moyasar uses halalah (cents)
      currency: paymentData.currency || 'SAR',
      status: 'paid',
      plan_type: planType,
      payment_method: paymentData.source?.type,
      metadata: paymentData,
    });

    return { processed: true, action: 'subscription_activated' };
  }

  /**
   * Handle failed payment
   */
  async handlePaymentFailed(paymentData) {
    const clinicId = paymentData.metadata?.clinic_id;

    if (!clinicId) {
      return { processed: false, reason: 'Missing clinic_id' };
    }

    await supabaseAdmin.from('payment_logs').insert({
      clinic_id: clinicId,
      payment_id: paymentData.id,
      amount: paymentData.amount / 100,
      currency: paymentData.currency || 'SAR',
      status: 'failed',
      plan_type: paymentData.metadata?.plan_type,
      payment_method: paymentData.source?.type,
      metadata: paymentData,
    });

    return { processed: true, action: 'payment_failure_logged' };
  }

  /**
   * Handle refunded payment - deactivate subscription
   */
  async handlePaymentRefunded(paymentData) {
    const clinicId = paymentData.metadata?.clinic_id;

    if (!clinicId) {
      return { processed: false, reason: 'Missing clinic_id' };
    }

    const { error } = await supabaseAdmin
      .from('users')
      .update({
        subscription_status: 'inactive',
        updated_at: new Date().toISOString(),
      })
      .eq('clinic_id', clinicId);

    if (error) {
      console.error('Error deactivating subscription:', error);
    }

    await supabaseAdmin.from('payment_logs').insert({
      clinic_id: clinicId,
      payment_id: paymentData.id,
      amount: paymentData.amount / 100,
      currency: paymentData.currency || 'SAR',
      status: 'refunded',
      plan_type: paymentData.metadata?.plan_type,
      metadata: paymentData,
    });

    return { processed: true, action: 'subscription_deactivated' };
  }

  /**
   * Create a payment session for subscription
   */
  async createPaymentSession(clinicId, planType, amount, callbackUrl) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/invoices`,
        {
          amount: amount * 100, // Convert to halalah
          currency: 'SAR',
          description: `ApptiCare ${planType} subscription`,
          callback_url: callbackUrl,
          metadata: {
            clinic_id: clinicId,
            plan_type: planType,
          },
        },
        {
          auth: {
            username: this.secretKey,
            password: '',
          },
        }
      );

      return {
        success: true,
        invoiceId: response.data.id,
        paymentUrl: response.data.url,
      };
    } catch (error) {
      console.error('Moyasar create session error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Fetch payment details from Moyasar
   */
  async getPayment(paymentId) {
    try {
      const response = await axios.get(`${this.baseUrl}/payments/${paymentId}`, {
        auth: {
          username: this.secretKey,
          password: '',
        },
      });
      return { success: true, payment: response.data };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }
}

module.exports = new MoyasarService();
