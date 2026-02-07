const express = require('express');
const User = require('../models/User');

const router = express.Router();

/**
 * GET /api/users
 * Obtiene todos los usuarios con sus estadísticas
 * Query params: period (week/month/year/all)
 */
router.get('/', async (req, res) => {
  try {
    const period = req.query.period || 'all';
    const db = require('../config/database');
    const { DateTime } = require('luxon');
    const tz = process.env.TZ || 'America/Lima';

    // Calcular fecha inicial según el periodo
    let dateFilter = '';
    const params = [];
    
    if (period !== 'all') {
      const now = new Date();
      let dateFrom = null;
      
      switch (period) {
        case 'week':
          dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'year':
          dateFrom = new Date(now.getFullYear(), 0, 1);
          break;
      }
      
      if (dateFrom) {
        dateFilter = 'AND s.submission_time >= ?';
        params.push(dateFrom);
      }
    }

    const query = `
      SELECT 
        u.id,
        u.handle,
        u.avatar_url,
        u.rating,
        u.\`rank\`,
        u.last_updated,
        u.current_streak,
        u.last_streak_date,
        COUNT(DISTINCT s.id) as total_submissions,
        COALESCE(SUM(CASE WHEN s.rating IS NULL OR s.rating = 0 THEN 1 ELSE 0 END), 0) as count_no_rating,
        COALESCE(SUM(CASE WHEN s.rating >= 800 AND s.rating <= 900 THEN 1 ELSE 0 END), 0) as count_800_900,
        COALESCE(SUM(CASE WHEN s.rating = 1000 THEN 1 ELSE 0 END), 0) as count_1000,
        COALESCE(SUM(CASE WHEN s.rating = 1100 THEN 1 ELSE 0 END), 0) as count_1100,
        COALESCE(SUM(CASE WHEN s.rating >= 1200 THEN 1 ELSE 0 END), 0) as count_1200_plus,
        (
          COALESCE(SUM(CASE WHEN s.rating IS NULL OR s.rating = 0 THEN 1 ELSE 0 END), 0) + 
          COALESCE(SUM(CASE WHEN s.rating >= 800 AND s.rating <= 900 THEN 1 ELSE 0 END), 0) + 
          COALESCE(SUM(CASE WHEN s.rating = 1000 THEN 1 ELSE 0 END), 0) * 2 + 
          COALESCE(SUM(CASE WHEN s.rating = 1100 THEN 1 ELSE 0 END), 0) * 3 + 
          COALESCE(SUM(CASE WHEN s.rating >= 1200 THEN 1 ELSE 0 END), 0) * 5
        ) as total_score
      FROM users u
      LEFT JOIN submissions s ON u.id = s.user_id
      WHERE u.enabled = TRUE AND u.is_hidden = FALSE ${dateFilter ? `AND ${dateFilter.substring(4)}` : ''}
      GROUP BY u.id, u.handle, u.avatar_url, u.rating, u.\`rank\`, u.last_updated, u.current_streak, u.last_streak_date
      ORDER BY total_score DESC, u.handle ASC
    `;

    // Adjust params if dateFilter was added
    if (dateFilter) {
      // The dateFrom parameter is already in the 'params' array.
      // No need to add it again here.
    }

    const [rows] = await db.query(query, params);

    // Process each user to determine if streak is active
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const processedRows = rows.map(user => {
      return {
        ...User.formatUser(user),
        streak_active: User.isStreakActive(user.last_streak_date, user.current_streak)
      };
    });

    // Obtener última ejecución real del tracker desde la BD (persistente)
    let lastTrackerRun = 'Nunca';
    try {
      const [meta] = await db.query(
        "SELECT value FROM system_metadata WHERE key_name = 'last_tracker_run'"
      );
      
      if (meta.length > 0 && meta[0].value) {
        // Interpretar date UTC y formatear a Local
        lastTrackerRun = DateTime.fromSQL(meta[0].value, { zone: 'utc' })
          .setZone(tz)
          .toFormat('dd/MM/yyyy, hh:mm a');
      }
    } catch (err) {
      console.error('Error leyendo last_tracker_run:', err.message);
      // Fallback a "Ahora" si falla
      lastTrackerRun = DateTime.now().setZone(tz).toFormat('dd/MM/yyyy, hh:mm a');
    }

    res.json({
      success: true,
      data: processedRows,
      lastTrackerRun: lastTrackerRun
    });
  } catch (err) {
    console.error('Error en GET /api/users:', err.message);
    res.status(500).json({
      success: false,
      error: 'Error al obtener usuarios'
    });
  }
});

/**
 * GET /api/users/:handle
 * Obtiene información detallada de un usuario
 */
router.get('/:handle', async (req, res) => {
  try {
    const { handle } = req.params;
    const user = await User.findByHandle(handle);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    // Check if user is disabled or hidden
    if (!user.enabled || user.is_hidden) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no disponible'
      });
    }

    res.json({
      success: true,
      data: {
        ...User.formatUser(user),
        streak_active: User.isStreakActive(user.last_streak_date, user.current_streak)
      }
    });
  } catch (err) {
    console.error('Error en GET /api/users/:handle:', err.message);
    res.status(500).json({
      success: false,
      error: 'Error al obtener usuario'
    });
  }
});

module.exports = router;
