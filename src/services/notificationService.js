const db = require('../config/database');

/**
 * Crea una nueva notificación en la base de datos
 */
async function createNotification(type, message, relatedId = null, link = null, expireHours = 24) {
  try {
    const expiresAt = new Date(Date.now() + expireHours * 60 * 60 * 1000);
    
    // Evitar duplicados recientes para el mismo relatedId y tipo (ej: mismo contest avisado hoy)
    if (relatedId) {
        const [existing] = await db.query(
            `SELECT id FROM notifications 
             WHERE type = ? AND related_id = ? 
             AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
            [type, relatedId]
        );
        if (existing.length > 0) return; // Ya existe aviso reciente
    }

    await db.query(
      `INSERT INTO notifications (type, message, related_id, link, expires_at) VALUES (?, ?, ?, ?, ?)`,
      [type, message, relatedId, link, expiresAt]
    );
    console.log(`📢 Notificación creada: [${type}] ${message} ${link ? `(Link: ${link})` : ''}`);
  } catch (err) {
    console.error('Error creating notification:', err.message);
  }
}

/**
 * Obtiene las notificaciones activas (no expiradas)
 * Limitado a las últimas N
 */
async function getActiveNotifications(limit = 10) {
  const [rows] = await db.query(
    `SELECT * FROM notifications 
     WHERE (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC 
     LIMIT ?`,
    [limit]
  );
  return rows;
}

/**
 * Gestión del Banner Global (Metadata)
 */
async function setGlobalBanner(message, type, durationHours = 24) {
    const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();
    
    const queries = [
        db.query(`INSERT INTO system_metadata (key_name, value) VALUES ('banner_msg', ?) ON DUPLICATE KEY UPDATE value = ?`, [message, message]),
        db.query(`INSERT INTO system_metadata (key_name, value) VALUES ('banner_type', ?) ON DUPLICATE KEY UPDATE value = ?`, [type, type]),
        db.query(`INSERT INTO system_metadata (key_name, value) VALUES ('banner_exp', ?) ON DUPLICATE KEY UPDATE value = ?`, [expiresAt, expiresAt])
    ];

    await Promise.all(queries);
}

async function getGlobalBanner() {
    const [rows] = await db.query(
        `SELECT key_name, value FROM system_metadata WHERE key_name IN ('banner_msg', 'banner_type', 'banner_exp')`
    );
    
    const banner = rows.reduce((acc, row) => {
        acc[row.key_name] = row.value;
        return acc;
    }, {});

    if (!banner.banner_msg || !banner.banner_exp) return null;

    // Check expiration
    if (new Date(banner.banner_exp) < new Date()) {
        return null; // Expired
    }

    return {
        message: banner.banner_msg,
        type: banner.banner_type || 'info', // info, warning, error
        expiresAt: banner.banner_exp
    };
}

async function deleteGlobalBanner() {
    await db.query(`DELETE FROM system_metadata WHERE key_name IN ('banner_msg', 'banner_type', 'banner_exp')`);
}

module.exports = {
  createNotification,
  getActiveNotifications,
  setGlobalBanner,
  getGlobalBanner,
  deleteGlobalBanner
};
