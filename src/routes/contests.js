const express = require('express');
const router = express.Router();
const { getUpcomingContests } = require('../services/contestService');

// GET /api/contests
router.get('/', async (req, res) => {
    try {
        const result = await getUpcomingContests();
        res.json({
            success: true,
            data: result.contests,
            lastUpdated: result.lastUpdated
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Error al obtener contests'
        });
    }
});

module.exports = router;