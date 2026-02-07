const db = require('../config/database');

/**
 * Registra una acción de auditoría
 * @param {Object} params
 * @param {number|null} params.adminId - ID del admin (si aplica)
 * @param {string} params.action - Tipo de acción (LOGIN, CREATE_USER, etc)
 * @param {Object|null} params.details - JSON con detalles
 * @param {string} params.ip - Dirección IP
 * @param {string} params.userAgent - User Agent del navegador
 */
async function logAction({ adminId, action, details, ip, userAgent }) {
  try {
    const detailsJson = details ? JSON.stringify(details) : null;
    
    await db.query(
      `INSERT INTO audit_logs (admin_id, action, details, ip_address, user_agent) 
       VALUES (?, ?, ?, ?, ?)`,
      [adminId || null, action, detailsJson, ip, userAgent]
    );
  } catch (err) {
    console.error('❌ Error guardando log de auditoría:', err.message);
    // No lanzar error para no interrumpir el flujo principal
  }
}

module.exports = { logAction };
