const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const authMiddleware = require('../middleware/auth');
// We need to access some user logic, ideally refactored, but for now we might need to duplicate or require User model
// Ideally we should use the script logic or the service if it existed.
// Looking at package.json, we have scripts/createUser.js. 
// We should probably invoke the logic from there or a service.
// Let's check if there is a User model with create method. 
// Checking User.js in previous file view, it has findByHandle.
const User = require('../models/User'); 
const { logAction } = require('../services/auditService');
const { trackUser } = require('../services/trackerService');
const { getUserInfo } = require('../services/codeforcesService');

// Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const [admins] = await db.query('SELECT * FROM admins WHERE username = ?', [username]);
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

// Get All Users (for admin, includes hidden)
router.get('/users', async (req, res) => {
  try {
    const [users] = await db.query('SELECT id, handle, is_hidden, enabled, last_updated FROM users ORDER BY handle ASC');
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error al obtener usuarios' });
  }
});

// Add User
// Add User (Full Initialization)
router.post('/users', async (req, res) => {
  const { handle } = req.body;
  if (!handle) return res.status(400).json({ success: false, error: 'Handle requerido' });

  try {
    // 1. Check if exists in DB
    const existing = await User.findByHandle(handle);
    if (existing) {
      return res.status(400).json({ success: false, error: 'El usuario ya existe' });
    }

    // 2. Verify in Codeforces
    let userInfo;
    try {
        userInfo = await getUserInfo(handle);
    } catch (err) {
        return res.status(404).json({ success: false, error: `Usuario '${handle}' no encontrado en Codeforces` });
    }

    // 3. Create User in DB
    const userId = await User.create(handle);

    // 4. Update Info
    const avatarUrl = userInfo.avatar || userInfo.titlePhoto || null;
    const fullAvatarUrl = avatarUrl && avatarUrl.startsWith('//') ? `https:${avatarUrl}` : avatarUrl;

    await User.updateUserInfo(userId, {
        avatarUrl: fullAvatarUrl,
        rating: userInfo.rating || null,
        rank: userInfo.rank || null,
        lastSubmissionTime: null
    });

    // 5. Initialize Stats
    await db.query(`INSERT INTO user_stats (user_id) VALUES (?)`, [userId]);

    // 6. Track User
    const trackResult = await trackUser(handle);
    
    // 7. Calculate Streak
    const streakResult = await User.intelligentStreakCalculation(userId);
    if (streakResult.streak > 0) {
        await db.query(
            'UPDATE users SET current_streak = ?, last_streak_date = ? WHERE id = ?',
            [streakResult.streak, streakResult.lastDate, userId]
        );
    }

    await logAction({ 
        adminId: req.admin.id, 
        action: 'CREATE_USER', 
        details: { handle, userId, rank: userInfo.rank }, 
        ip: req.ip, 
        userAgent: req.get('User-Agent') 
    });

    res.json({ 
        success: true, 
        message: 'Usuario creado y trackeado exitosamente',
        data: {
            handle,
            newSubmissions: trackResult.newSubmissions,
            streak: streakResult.streak,
            rank: userInfo.rank
        }
    });

  } catch (err) {
    console.error('Add User Error:', err);
    res.status(500).json({ success: false, error: 'Error al agregar usuario: ' + err.message });
  }
});

// Toggle Visibility
router.put('/users/:handle/visibility', async (req, res) => {
  const { handle } = req.params;
  try {
    // Check current status
    const [rows] = await db.query('SELECT is_hidden FROM users WHERE handle = ?', [handle]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    const newStatus = !rows[0].is_hidden;
    await db.query('UPDATE users SET is_hidden = ? WHERE handle = ?', [newStatus, handle]);

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

// Toggle Enabled/Disabled
router.put('/users/:handle/enable', async (req, res) => {
  const { handle } = req.params;
  try {
    const [rows] = await db.query('SELECT enabled FROM users WHERE handle = ?', [handle]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    const newStatus = !rows[0].enabled;
    await db.query('UPDATE users SET enabled = ? WHERE handle = ?', [newStatus, handle]);

    await logAction({ 
        adminId: req.admin.id, 
        action: 'TOGGLE_ENABLED', 
        details: { handle, newStatus }, 
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
      const query = `
          SELECT 
              l.ip_address,
              MAX(l.timestamp) as last_active,
              COUNT(*) as total_requests,
              GROUP_CONCAT(DISTINCT a.username SEPARATOR ', ') as admin_usernames,
              JSON_ARRAYAGG(l.action) as recent_actions -- Just a sample
          FROM audit_logs l
          LEFT JOIN admins a ON l.admin_id = a.id
          GROUP BY l.ip_address
          ORDER BY last_active DESC
      `;
      
      const [rows] = await db.query(query);
      
      // Process rows to create a action summary locally if SQL is too complex for simple JSON_OBJECT
      const processed = rows.map(row => {
          // Count actions 
          // Note: JSON_ARRAYAGG might be huge, let's optimize SQL if needed. 
          // Actually let's just do a simpler summary in JS for now or limit the agg.
          // For now, let's not aggregate ALL actions, maybe just unique ones is better in SQL:
          // GROUP_CONCAT(DISTINCT l.action)
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
      const condition = ' AND l.ip_address = ?';
      query += condition;
      countQuery += condition;
      params.push(ip);
      countParams.push(ip);
    }
    if (method) {
      // Frontend still sends 'method' but it maps to 'action'
      const condition = ' AND l.action = ?';
      query += condition;
      countQuery += condition;
      params.push(method);
      countParams.push(method);
    }
    
    if (startDate) {
      const condition = ' AND l.timestamp >= ?';
      query += condition;
      countQuery += condition;
      params.push(startDate); 
      countParams.push(startDate);
    }
    if (endDate) {
      const condition = ' AND l.timestamp <= ?';
      query += condition;
      countQuery += condition;
      params.push(endDate + ' 23:59:59'); 
      countParams.push(endDate + ' 23:59:59');
    }

    query += ' ORDER BY l.timestamp DESC LIMIT ? OFFSET ?';
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

module.exports = router;
