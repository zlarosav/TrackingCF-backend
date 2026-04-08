const express = require('express');
const router = express.Router();
const { getUpcomingContests, getContestParticipants } = require('../services/contestService');

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

// GET /api/contests/:platform/:contestId/participants
router.get('/:platform/:contestId/participants', async (req, res) => {
    try {
        const { platform, contestId } = req.params;
        const participants = await getContestParticipants(contestId, platform.toUpperCase());

        res.json({
            success: true,
            data: participants,
            total: participants.length
        });
    } catch (error) {
        console.error('Error al obtener participantes del contest:', error.message);
        res.status(500).json({
            success: false,
            error: 'Error al obtener participantes'
        });
    }
});

module.exports = router;