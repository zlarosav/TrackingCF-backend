const bcrypt = require('bcryptjs');
const db = require('../config/database');

class ProvisioningError extends Error {
  constructor(message, code, statusCode = 400) {
    super(message);
    this.name = 'ProvisioningError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

async function countAdmins() {
  const [rows] = await db.query('SELECT COUNT(*) AS total FROM admins');
  return Number(rows[0]?.total || 0);
}

async function createAdmin({ username, password }) {
  const cleanUsername = String(username || '').trim();
  const cleanPassword = String(password || '');

  if (!cleanUsername) {
    throw new ProvisioningError('El usuario admin es requerido.', 'ADMIN_USERNAME_REQUIRED');
  }

  if (!cleanPassword) {
    throw new ProvisioningError('La contraseña admin es requerida.', 'ADMIN_PASSWORD_REQUIRED');
  }

  const [existing] = await db.query('SELECT id FROM admins WHERE username = ?', [cleanUsername]);
  if (existing.length > 0) {
    throw new ProvisioningError(`El administrador "${cleanUsername}" ya existe.`, 'ADMIN_EXISTS', 409);
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(cleanPassword, salt);
  const [result] = await db.query(
    'INSERT INTO admins (username, password_hash) VALUES (?, ?)',
    [cleanUsername, passwordHash]
  );

  return {
    id: result.insertId,
    username: cleanUsername,
  };
}

module.exports = {
  ProvisioningError,
  countAdmins,
  createAdmin,
};
