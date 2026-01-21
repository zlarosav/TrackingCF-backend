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

    // Calcular fecha inicial según el período
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
      LEFT JOIN submissions s ON u.id = s.user_id ${dateFilter}
      GROUP BY u.id, u.handle, u.avatar_url, u.rating, u.\`rank\`, u.last_updated
      ORDER BY total_score DESC, u.handle ASC
    `;

    const [rows] = await db.query(query, params);

    res.json({
      success: true,
      data: rows
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

    res.json({
      success: true,
      data: user
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
