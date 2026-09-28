const express = require('express');
const { DateTime } = require('luxon');
const db = require('../config/database');

const router = express.Router();

const FEATURE_ATCODER_SUBMISSIONS = 'feature_atcoder_submissions';

// Convierte un valor SQL UTC (yyyy-MM-dd HH:mm:ss o Date) a ISO 8601 UTC, o null.
function toIso(value) {
    if (!value) return null;
    if (value instanceof Date) return DateTime.fromJSDate(value, { zone: 'utc' }).toISO();
    const dt = DateTime.fromSQL(String(value), { zone: 'utc' });
    return dt.isValid ? dt.toISO() : null;
}

function isFlagOn(value) {
    const v = String(value || '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'on' || v === 'enabled';
}

/**
 * GET /api/meta
 * Señal de frescura ligera para que el frontend decida si invalidar su caché.
 * Devuelve los timestamps crudos en ISO UTC (no localizados) + el feature flag.
 */
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT key_name, value FROM system_metadata WHERE key_name IN ('last_tracker_run', 'last_contest_update', $1)",
            [FEATURE_ATCODER_SUBMISSIONS]
        );

        const map = {};
        for (const r of rows) map[r.key_name] = r.value;

        res.set('Cache-Control', 'no-store');
        res.json({
            success: true,
            data: {
                lastTrackerRun: toIso(map['last_tracker_run']),
                lastContestUpdate: toIso(map['last_contest_update']),
                atcoderSubmissions: isFlagOn(map[FEATURE_ATCODER_SUBMISSIONS])
            }
        });
    } catch (error) {
        console.error('Error en GET /api/meta:', error.message);
        res.status(500).json({ success: false, error: 'Error al obtener metadata' });
    }
});

module.exports = router;
