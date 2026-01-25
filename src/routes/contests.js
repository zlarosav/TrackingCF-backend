const express = require('express');
const router = express.Router();
const { getUpcomingContests, updateContests } = require('../services/contestService');

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

// POST /api/contests/refresh (Optional manual trigger)
router.post('/refresh', async (req, res) => {
    try {
        await updateContests();
        const result = await getUpcomingContests();
        res.json({
            success: true,
            message: 'Contests actualizados correctamente',
            data: result.contests,
            lastUpdated: result.lastUpdated
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Error al actualizar contests'
        });
    }
});

module.exports = router;
