const express = require('express');
const User = require('../models/User');
const Submission = require('../models/Submission');
const { getUserDetailedStats } = require('../services/statsService');

const router = express.Router();

/**
 * GET /api/submissions
 * Obtiene las últimas submissions de todos los usuarios con filtros de fecha
 * Query params: period (week/month/2months/6months/year/all), sortBy, order, limit
 */
router.get('/', async (req, res) => {
  try {
    const period = req.query.period || 'month';
    const sortBy = req.query.sortBy || 'submission_time';
    const order = req.query.order || 'desc';
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    // Calcular fecha inicial según el período
    let dateFrom = null;
    const now = new Date();
    
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
      case 'all':
      default:
        dateFrom = null;
    }

    const db = require('../config/database');
    
    let query = `
      SELECT 
        s.id,
        s.contest_id,
        s.problem_index,
        s.problem_name,
        s.rating,
        s.tags,
        s.submission_time,
        u.handle,
        u.avatar_url
      FROM submissions s
      JOIN users u ON s.user_id = u.id
    `;

    const params = [];
    
    if (dateFrom) {
      query += ` WHERE s.submission_time >= ?`;
      params.push(dateFrom);
    }

    query += ` ORDER BY s.${sortBy} ${order.toUpperCase()}`;
    query += ` LIMIT ?`;
    params.push(limit);

    const [rows] = await db.query(query, params);

    // Parsear tags JSON
    const submissions = rows.map(row => {
      let parsedTags = [];
      try {
        if (typeof row.tags === 'string') {
          parsedTags = JSON.parse(row.tags);
        } else if (Array.isArray(row.tags)) {
          parsedTags = row.tags;
        }
      } catch (err) {
        console.error(`Error parseando tags para submission ${row.id}:`, err.message);
        parsedTags = [];
      }
      
      return {
        ...row,
        tags: parsedTags
      };
    });

    res.json({
      success: true,
      data: {
        submissions,
        period,
        total: rows.length
      }
    });

  } catch (err) {
    console.error('Error en GET /api/submissions:', err.message);
    res.status(500).json({
      success: false,
      error: 'Error al obtener submissions'
    });
  }
});

/**
 * GET /api/submissions/:handle
 * Obtiene las submissions de un usuario con filtros
 * Query params: ratingMin, ratingMax, dateFrom, dateTo, sortBy, order, limit, offset, noRating
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

    // Extraer filtros de query params
    const filters = {
      ratingMin: req.query.ratingMin ? parseInt(req.query.ratingMin) : undefined,
      ratingMax: req.query.ratingMax ? parseInt(req.query.ratingMax) : undefined,
      dateFrom: req.query.dateFrom || undefined,
      dateTo: req.query.dateTo || undefined,
      sortBy: req.query.sortBy || 'submission_time',
      order: req.query.order || 'desc',
      limit: req.query.limit ? parseInt(req.query.limit) : 100,
      offset: req.query.offset ? parseInt(req.query.offset) : 0,
      noRating: req.query.noRating || undefined
    };

    const submissions = await Submission.findByUser(user.id, filters);
    const total = await Submission.countByUser(user.id, filters);

    res.json({
      success: true,
      data: {
        submissions,
        pagination: {
          total,
          limit: filters.limit,
          offset: filters.offset,
          hasMore: filters.offset + submissions.length < total
        }
      }
    });
  } catch (err) {
    console.error('Error en GET /api/submissions/:handle:', err.message);
    res.status(500).json({
      success: false,
      error: 'Error al obtener submissions'
    });
  }
});

/**
 * GET /api/submissions/:handle/stats
 * Obtiene estadísticas detalladas y datos para gráficos
 */
router.get('/:handle/stats', async (req, res) => {
  try {
    const { handle } = req.params;
    const user = await User.findByHandle(handle);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    const stats = await getUserDetailedStats(user.id);

    res.json({
      success: true,
      data: stats
    });
  } catch (err) {
    console.error('Error en GET /api/submissions/:handle/stats:', err.message);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas'
    });
  }
});

/**
 * GET /api/submissions/:handle/latest
 * Obtiene las últimas N submissions de un usuario
 */
router.get('/:handle/latest', async (req, res) => {
  try {
    const { handle } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit) : 10;

    const user = await User.findByHandle(handle);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    const submissions = await Submission.findLatestByUser(user.id, limit);

    res.json({
      success: true,
      data: submissions
    });
  } catch (err) {
    console.error('Error en GET /api/submissions/:handle/latest:', err.message);
    res.status(500).json({
      success: false,
      error: 'Error al obtener últimas submissions'
    });
  }
});

module.exports = router;
