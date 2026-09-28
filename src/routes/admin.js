const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const authMiddleware = require('../middleware/auth');
const User = require('../models/User'); 
const { logAction } = require('../services/auditService');
const { trackUser } = require('../services/trackerService');
const { getUserInfo } = require('../services/codeforcesService');
const { createTrackedUser } = require('../services/userProvisioningService');
// const { updateContests } = require('../services/contestService'); // REVERTIDO

const FEATURE_ATCODER_SUBMISSIONS = 'feature_atcoder_submissions';

function parseFlagValue(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'enabled';
}

// Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const [admins] = await db.query('SELECT * FROM admins WHERE username = $1', [username]);
    if (admins.length === 0) {
      await logAction({ adminId: null, action: 'LOGIN_FAILED', details: { username, reason: 'user_not_found' }, ip: req.ip, userAgent: req.get('User-Agent') });
      return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
    }

    const admin = admins[0];
    const validPassword = await bcrypt.compare(password, admin.password_hash);
    if (!validPassword) {
      await logAction({ adminId: admin.id, action: 'LOGIN_FAILED', details: { username, reason: 'wrong_password' }, ip: req.ip, userAgent: req.get('User-Agent') });
      return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
    }

    const secret = process.env.JWT_SECRET || 'secret_key_change_me';
    const token = jwt.sign({ id: admin.id, username: admin.username }, secret, { expiresIn: '24h' });

    await logAction({ adminId: admin.id, action: 'LOGIN_SUCCESS', details: { username }, ip: req.ip, userAgent: req.get('User-Agent') });

    res.json({ success: true, token });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ success: false, error: 'Error en el servidor' });
  }
});

// Protect all routes below
router.use(authMiddleware);

router.get('/feature-flags', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT key_name, value FROM system_metadata WHERE key_name = $1', [FEATURE_ATCODER_SUBMISSIONS]);
    const atcoderRow = rows.find((r) => r.key_name === FEATURE_ATCODER_SUBMISSIONS);

    res.json({
      success: true,
      data: {
        atcoderSubmissions: parseFlagValue(atcoderRow?.value, false)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Error al obtener feature flags' });
  }
});

router.put('/feature-flags/atcoder-submissions', async (req, res) => {
  const enabled = parseFlagValue(req.body?.enabled, false);

  try {
    await db.query(
      `INSERT INTO system_metadata (key_name, value)
       VALUES ($1, $2)
       ON CONFLICT (key_name) DO UPDATE SET value = EXCLUDED.value`,
      [FEATURE_ATCODER_SUBMISSIONS, enabled ? '1' : '0']
    );

    await logAction({
      adminId: req.admin.id,
      action: 'TOGGLE_ATCODER_SUBMISSIONS',
      details: { enabled },
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({ success: true, data: { atcoderSubmissions: enabled } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Error al actualizar feature flag' });
  }
});

// Get All Users (for admin, includes hidden)
router.get('/users', async (req, res) => {
  try {
    const [users] = await db.query('SELECT id, handle, leetcode_handle, atcoder_handle, codechef_handle, is_hidden, enabled, last_updated FROM users ORDER BY handle ASC');
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error al obtener usuarios' });
  }
});

// Quick status summary for enable/visibility diagnostics
router.get('/users/status-summary', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE enabled) AS enabled,
         COUNT(*) FILTER (WHERE NOT enabled) AS disabled,
         COUNT(*) FILTER (WHERE is_hidden) AS hidden,
         COUNT(*) FILTER (WHERE NOT is_hidden) AS visible
       FROM users`
    );

    res.json({ success: true, data: rows[0] || {} });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Error al obtener resumen de usuarios' });
  }
});

// Get disabled users list (for quick diagnostics)
router.get('/users/disabled', async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT id, handle, is_hidden, enabled, last_updated FROM users WHERE enabled = FALSE ORDER BY last_updated DESC, handle ASC'
    );

    res.json({ success: true, data: users, total: users.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Error al obtener usuarios deshabilitados' });
  }
});

// Bulk re-enable all disabled users
router.put('/users/enable-all-disabled', async (req, res) => {
  try {
    const [result] = await db.query('UPDATE users SET enabled = TRUE WHERE enabled = FALSE');

    await logAction({
      adminId: req.admin.id,
      action: 'ENABLE_ALL_DISABLED_USERS',
      details: { affectedRows: result.affectedRows },
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({ success: true, enabled: result.affectedRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Error al habilitar usuarios deshabilitados' });
  }
});

// Add User
// Add User (Full Initialization)
router.post('/users', async (req, res) => {
  const { handle, leetcodeHandle, atcoderHandle, codechefHandle } = req.body;
  if (!handle) return res.status(400).json({ success: false, error: 'Handle requerido' });

  try {
    const createdUser = await createTrackedUser({
      handle,
      leetcodeHandle,
      atcoderHandle,
      codechefHandle
    });

    await logAction({
      adminId: req.admin.id,
      action: 'CREATE_USER',
      details: {
        handle: createdUser.handle,
        userId: createdUser.userId,
        rank: createdUser.rank,
        leetcodeHandle: createdUser.leetcodeHandle,
        atcoderHandle: createdUser.atcoderHandle,
        codechefHandle: createdUser.codechefHandle
      },
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Usuario creado y trackeado exitosamente',
      data: {
        handle: createdUser.handle,
        leetcodeHandle: createdUser.leetcodeHandle,
        atcoderHandle: createdUser.atcoderHandle,
        codechefHandle: createdUser.codechefHandle,
        newSubmissions: createdUser.newSubmissions,
        streak: createdUser.streak,
        rank: createdUser.rank,
        warnings: createdUser.warnings
      }
    });

  } catch (err) {
    console.error('Add User Error:', err);
    const statusCode = err.statusCode || 500;
    const errorMessage = err.statusCode ? err.message : 'Error al agregar usuario: ' + err.message;
    res.status(statusCode).json({ success: false, error: errorMessage });
  }
});

// Toggle Visibility
router.put('/users/:handle/visibility', async (req, res) => {
  const { handle } = req.params;
  try {
    // Check current status
    const [rows] = await db.query('SELECT is_hidden FROM users WHERE handle = $1', [handle]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    const newStatus = !rows[0].is_hidden;
    await db.query('UPDATE users SET is_hidden = $1 WHERE handle = $2', [newStatus, handle]);

    await logAction({ 
        adminId: req.admin.id, 
        action: 'TOGGLE_VISIBILITY', 
        details: { handle, newStatus }, 
        ip: req.ip, 
        userAgent: req.get('User-Agent') 
    });

    res.json({ success: true, is_hidden: newStatus });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error al actualizar visibilidad' });
  }
});

// Set Enabled/Disabled explicitly (idempotent)
router.put('/users/:handle/enable', async (req, res) => {
  const { handle } = req.params;
  try {
    const [rows] = await db.query('SELECT enabled FROM users WHERE handle = $1', [handle]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    const hasExplicitStatus = req.body && Object.prototype.hasOwnProperty.call(req.body, 'enabled');
    const newStatus = hasExplicitStatus ? parseFlagValue(req.body.enabled, false) : !rows[0].enabled;
    await db.query('UPDATE users SET enabled = $1 WHERE handle = $2', [newStatus, handle]);

    await logAction({ 
        adminId: req.admin.id, 
        action: hasExplicitStatus ? 'SET_ENABLED' : 'TOGGLE_ENABLED', 
        details: { handle, previousStatus: !!rows[0].enabled, newStatus }, 
        ip: req.ip, 
        userAgent: req.get('User-Agent') 
    });

    res.json({ success: true, enabled: newStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Error al actualizar estado' });
  }
});

// Manual Track
router.post('/users/:handle/track', async (req, res) => {
  const { handle } = req.params;
  try {
    const result = await trackUser(handle);
    if (result.error) {
        return res.status(500).json({ success: false, error: result.error });
    }


    await logAction({ 
        adminId: req.admin.id, 
        action: 'MANUAL_TRACK', 
        details: { handle, newSubmissions: result.newSubmissions }, 
        ip: req.ip, 
        userAgent: req.get('User-Agent') 
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Error al ejecutar tracking' });
  }
});

// Rename User
router.put('/users/:handle/rename', async (req, res) => {
  const { handle } = req.params;
  const { newHandle } = req.body;

  if (!newHandle) return res.status(400).json({ success: false, error: 'Nuevo handle requerido' });

  try {
    // 1. Verify existence in DB
    const user = await User.findByHandle(handle);
    if (!user) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    // 2. Verify new handle in Codeforces
    try {
        await getUserInfo(newHandle);
    } catch (err) {
        return res.status(400).json({ success: false, error: `El handle '${newHandle}' no existe en Codeforces` });
    }

    // 3. Update DB
    const success = await User.rename(handle, newHandle);
    if (!success) {
        return res.status(500).json({ success: false, error: 'No se pudo renombrar el usuario' });
    }

    await logAction({ 
        adminId: req.admin.id, 
        action: 'RENAME_USER', 
        details: { oldHandle: handle, newHandle }, 
        ip: req.ip, 
        userAgent: req.get('User-Agent') 
    });

    res.json({ success: true, message: `Usuario renombrado a ${newHandle}` });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Error al renombrar usuario' });
  }
});

// Update platform handles (LeetCode, AtCoder, CodeChef)
router.put('/users/:handle/platform-handles', async (req, res) => {
  const { handle } = req.params;
  const { leetcodeHandle, atcoderHandle, codechefHandle } = req.body;

  try {
    const user = await User.findByHandle(handle);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    await User.updatePlatformHandles(user.id, {
      leetcodeHandle,
      atcoderHandle,
      codechefHandle
    });

    await logAction({
      adminId: req.admin.id,
      action: 'UPDATE_PLATFORM_HANDLES',
      details: {
        handle,
        leetcodeHandle: leetcodeHandle || null,
        atcoderHandle: atcoderHandle || null,
        codechefHandle: codechefHandle || null
      },
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Handles de plataformas actualizados',
      data: {
        handle,
        leetcodeHandle: leetcodeHandle || null,
        atcoderHandle: atcoderHandle || null,
        codechefHandle: codechefHandle || null
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Error al actualizar handles de plataformas' });
  }
});

// Delete User
router.delete('/users/:handle', async (req, res) => {
  const { handle } = req.params;
  try {
    const success = await User.delete(handle);
    if (!success) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    await logAction({ 
        adminId: req.admin.id, 
        action: 'DELETE_USER', 
        details: { handle }, 
        ip: req.ip, 
        userAgent: req.get('User-Agent') 
    });

    res.json({ success: true, message: 'Usuario eliminado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Error al eliminar usuario' });
  }
});

// Get Audit Summary (Grouped by IP)
router.get('/audit-summary', async (req, res) => {
  try {
      console.log('DEBUG: GET /audit-summary', req.query);
      const { action } = req.query;
      
      let query = `
          SELECT 
              l.ip_address,
              MAX(l.timestamp) as last_active,
              COUNT(*) as total_requests,
              STRING_AGG(DISTINCT a.username, ', ') as admin_usernames
          FROM audit_logs l
          LEFT JOIN admins a ON l.admin_id = a.id
          WHERE 1=1
      `;
      
      const params = [];
      
      if (action) {
          query += ` AND l.action = $${params.length + 1}`;
          params.push(action);
      }
      
      query += `
          GROUP BY l.ip_address
          ORDER BY last_active DESC
      `;
      
      const [rows] = await db.query(query, params);
      
      // Process rows to create a action summary locally if SQL is too complex for simple JSON_OBJECT
      const processed = rows.map(row => {
          // Count actions 
          // Note: JSON_ARRAYAGG might be huge, let's optimize SQL if needed. 
          // Actually let's just do a simpler summary in JS for now or limit the agg.
          // For now, let's not aggregate ALL actions, maybe just unique ones is better in SQL:
          // STRING_AGG(DISTINCT l.action, ', ')
          return {
              ip: row.ip_address,
              lastActive: row.last_active,
              totalRequests: row.total_requests,
              admins: row.admin_usernames ? row.admin_usernames.split(', ') : [],
              // We'll fetch details on expand
          };
      });

      res.json({ success: true, data: processed });
  } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, error: 'Error al obtener resumen de auditoría' });
  }
});

// Get Audit Logs
router.get('/audit-logs', async (req, res) => {
  try {
    console.log('DEBUG: GET /audit-logs', req.query);
    const page = parseInt(req.query.page) || 1;
    // Force restart comment
    const limit = 50;
    const offset = (page - 1) * limit;

    // Filters
    const { ip, method, startDate, endDate } = req.query;
    
    let query = `
        SELECT l.*, a.username 
        FROM audit_logs l 
        LEFT JOIN admins a ON l.admin_id = a.id 
        WHERE 1=1`;
    let params = [];

    // Count query base
    let countQuery = `
        SELECT COUNT(*) as total 
        FROM audit_logs l 
        WHERE 1=1`;
    let countParams = [];

    if (ip) {
      query += ` AND l.ip_address = $${params.length + 1}`;
      countQuery += ` AND l.ip_address = $${countParams.length + 1}`;
      params.push(ip);
      countParams.push(ip);
    }
    if (method) {
      // Frontend still sends 'method' but it maps to 'action'
      query += ` AND l.action = $${params.length + 1}`;
      countQuery += ` AND l.action = $${countParams.length + 1}`;
      params.push(method);
      countParams.push(method);
    }
    
    if (startDate) {
      query += ` AND l.timestamp >= $${params.length + 1}`;
      countQuery += ` AND l.timestamp >= $${countParams.length + 1}`;
      params.push(startDate); 
      countParams.push(startDate);
    }
    if (endDate) {
      query += ` AND l.timestamp <= $${params.length + 1}`;
      countQuery += ` AND l.timestamp <= $${countParams.length + 1}`;
      params.push(endDate + ' 23:59:59'); 
      countParams.push(endDate + ' 23:59:59');
    }

    query += ` ORDER BY l.timestamp DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const [logs] = await db.query(query, params);
    const [countResult] = await db.query(countQuery, countParams);
    
    res.json({
      success: true,
      data: logs,
      pagination: {
        page,
        limit,
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / limit)
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Error al obtener logs: ' + err.message });
  }
});

/**
 * POST /api/admin/backfill
 * Backfill: carga todas las submissions desde 2024 para todos los usuarios
 */
router.post('/backfill', async (req, res) => {
  try {
    const db = require('../config/database');
    const cfApi = require('../utils/callCodeforcesApi');
    const Submission = require('../models/Submission');
    const { calculateUserStats } = require('../services/statsService');
    const { DateTime } = require('luxon');
    const { filterValidSubmissions, formatSubmission } = require('../services/trackerService');

    const [users] = await db.query('SELECT id, handle FROM users WHERE enabled = TRUE');
    const results = [];

    for (const user of users) {
      try {
        const raw = await cfApi('user.status', { handle: user.handle, from: 1, count: 5000 });
        if (!raw || !raw.length) continue;

        const valid = raw.filter(sub => {
          if (sub.verdict !== 'OK') return false;
          if (sub.creationTimeSeconds < 1704067200) return false; // desde 2024
          return true;
        });

        if (!valid.length) continue;

        const formatted = valid.map(formatSubmission);
        const newCount = await Submission.bulkCreate(user.id, formatted);
        await calculateUserStats(user.id);

        if (newCount > 0) {
          await db.query('UPDATE users SET last_submission_time = $1, last_updated = CURRENT_TIMESTAMP WHERE id = $2', [formatted[0].submissionTime, user.id]);
        }

        results.push({ handle: user.handle, newSubmissions: newCount });
        console.log(`✅ ${user.handle}: ${newCount} nuevas`);
        await new Promise(r => setTimeout(r, 600));
      } catch (err) {
        results.push({ handle: user.handle, error: err.message });
        console.error(`❌ ${user.handle}: ${err.message}`);
      }
    }

    await logAction({ adminId: req.admin.id, action: 'BACKFILL', details: { results }, ip: req.ip, userAgent: req.get('User-Agent') });

    res.json({ success: true, data: results });
  } catch (err) {
    console.error('Backfill error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
