const express = require('express');
const { authenticate } = require('../middleware/auth');
const analyticsService = require('../services/analytics');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/analytics/dashboard
 * Get comprehensive dashboard analytics
 */
router.get('/dashboard', async (req, res) => {
  try {
    const { date_from, date_to } = req.query;

    const stats = await analyticsService.getDashboardStats(req.clinicId, date_from, date_to);

    res.json({ analytics: stats });
  } catch (err) {
    console.error('Dashboard analytics error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch analytics' });
  }
});

/**
 * GET /api/analytics/no-shows
 * Get no-show analytics with monthly trends
 */
router.get('/no-shows', async (req, res) => {
  try {
    const { months = 6 } = req.query;

    const trends = await analyticsService.getNoShowAnalytics(req.clinicId, parseInt(months, 10));

    res.json({ noShowTrends: trends });
  } catch (err) {
    console.error('No-show analytics error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch no-show analytics' });
  }
});

/**
 * GET /api/analytics/frequent-no-shows
 * Get patients with frequent no-shows
 */
router.get('/frequent-no-shows', async (req, res) => {
  try {
    const { min_no_shows = 2 } = req.query;

    const patients = await analyticsService.getFrequentNoShows(
      req.clinicId,
      parseInt(min_no_shows, 10)
    );

    res.json({ frequentNoShows: patients });
  } catch (err) {
    console.error('Frequent no-shows error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch frequent no-shows' });
  }
});

module.exports = router;
