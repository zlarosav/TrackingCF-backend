const express = require('express');
const router = express.Router();
const { getActiveNotifications, setGlobalBanner, getGlobalBanner, deleteGlobalBanner } = require('../services/notificationService');

/**
 * GET /api/notifications
 * Public: Returns active notifications (contests, rank ups) AND the global banner
 */
router.get('/', async (req, res) => {
    try {
        const [notifications, banner] = await Promise.all([
            getActiveNotifications(6), // Last 6 as requested
            getGlobalBanner()
        ]);

        res.json({
            success: true,
            data: {
                notifications,
                banner
            }
        });
    } catch (err) {
        console.error('Error fetching notifications:', err);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

/**
 * POST /api/notifications
 * Admin: Create a new notification
 */
 router.post('/', require('../middleware/auth'), async (req, res) => {
    try {
        const { message, type, related_id, link, expireHours } = req.body;
        
        if (!message || !type) {
            return res.status(400).json({ error: 'Message and type are required' });
        }

        const { createNotification } = require('../services/notificationService');
        await createNotification(type, message, related_id || null, link || null, expireHours || 24);
        
        res.json({ success: true, message: 'Notification created successfully' });
    } catch (err) {
        console.error('Error creating notification:', err);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

/**
 * POST /api/notifications/banner
 * Admin: Set global banner
 */
router.post('/banner', require('../middleware/auth'), async (req, res) => {
    try {
        const { message, type, duration } = req.body;
        if (!message || !type) return res.status(400).json({ error: 'Message and type required' });

        await setGlobalBanner(message, type, duration || 24);
        res.json({ success: true, message: 'Banner updated' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Error setting banner' });
    }
});

/**
 * DELETE /api/notifications/banner
 * Admin: Remove global banner
 */
router.delete('/banner', require('../middleware/auth'), async (req, res) => {
    try {
        await deleteGlobalBanner();
        res.json({ success: true, message: 'Banner removed' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Error removing banner' });
    }
});

module.exports = router;
