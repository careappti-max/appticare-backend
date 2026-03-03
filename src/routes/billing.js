const express = require('express');
const { authenticate } = require('../middleware/auth');
const { supabaseAdmin } = require('../config/supabase');
const moyasarService = require('../services/moyasar');
const config = require('../config/environment');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Plan pricing (in SAR)
const PLANS = {
  monthly: {
    name: 'Monthly',
    price: 299,
    description: 'ApptiCare Monthly Subscription',
  },
  yearly: {
    name: 'Yearly',
    price: 2990,
    description: 'ApptiCare Yearly Subscription (Save 17%)',
  },
};

/**
 * GET /api/billing/plans
 * Get available subscription plans
 */
router.get('/plans', (req, res) => {
  res.json({ plans: PLANS });
});

/**
 * GET /api/billing/subscription
 * Get current subscription status
 */
router.get('/subscription', async (req, res) => {
  try {
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select(
        'subscription_status, subscription_plan, subscription_start, subscription_end, moyasar_payment_id'
      )
      .eq('id', req.user.id)
      .single();

    if (error) {
      return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch subscription' });
    }

    // Check if subscription has expired
    if (
      user.subscription_status === 'active' &&
      user.subscription_end &&
      new Date(user.subscription_end) < new Date()
    ) {
      await supabaseAdmin
        .from('users')
        .update({
          subscription_status: 'expired',
          updated_at: new Date().toISOString(),
        })
        .eq('id', req.user.id);

      user.subscription_status = 'expired';
    }

    res.json({
      subscription: {
        status: user.subscription_status,
        plan: user.subscription_plan,
        start: user.subscription_start,
        end: user.subscription_end,
        isActive: user.subscription_status === 'active' || user.subscription_status === 'trialing',
      },
    });
  } catch (err) {
    console.error('Get subscription error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch subscription' });
  }
});

/**
 * POST /api/billing/create-session
 * Create a Moyasar payment session for subscription
 */
router.post('/create-session', async (req, res) => {
  try {
    const { plan_type = 'monthly' } = req.body;

    if (!PLANS[plan_type]) {
      return res.status(400).json({ error: 'Validation Error', message: 'Invalid plan type' });
    }

    const plan = PLANS[plan_type];
    const callbackUrl = `${req.protocol}://${req.get('host')}/webhooks/moyasar`;

    const result = await moyasarService.createPaymentSession(
      req.clinicId,
      plan_type,
      plan.price,
      callbackUrl
    );

    if (!result.success) {
      return res.status(500).json({
        error: 'Payment Error',
        message: result.error || 'Failed to create payment session',
      });
    }

    res.json({
      paymentUrl: result.paymentUrl,
      invoiceId: result.invoiceId,
      plan: {
        type: plan_type,
        name: plan.name,
        price: plan.price,
        currency: 'SAR',
      },
    });
  } catch (err) {
    console.error('Create payment session error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to create payment session' });
  }
});

/**
 * GET /api/billing/history
 * Get payment history
 */
router.get('/history', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const { data, error, count } = await supabaseAdmin
      .from('payment_logs')
      .select('*', { count: 'exact' })
      .eq('clinic_id', req.clinicId)
      .order('created_at', { ascending: false })
      .range((parseInt(page, 10) - 1) * parseInt(limit, 10), parseInt(page, 10) * parseInt(limit, 10) - 1);

    if (error) {
      return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch history' });
    }

    res.json({
      payments: data,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: count,
        pages: Math.ceil(count / parseInt(limit, 10)),
      },
    });
  } catch (err) {
    console.error('Get payment history error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch history' });
  }
});

module.exports = router;
