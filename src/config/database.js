require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'tracking_cf',
  max: Number(process.env.DB_POOL_SIZE || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  options: '-c timezone=UTC',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
});

// Preserve the existing tuple-style call contract while exposing PostgreSQL
// result metadata to write operations.
async function query(text, values = []) {
  const result = await pool.query(text, values);
  const isRead = ['SELECT', 'SHOW', 'EXPLAIN'].includes(result.command);
  const firstValue = isRead
    ? result.rows
    : {
        affectedRows: result.rowCount,
        rowCount: result.rowCount,
        insertId: result.rows[0]?.id,
        rows: result.rows,
      };

  return [firstValue, result.fields];
}

pool.query('SELECT 1')
  .then(() => {
    console.log('✅ PostgreSQL conectado exitosamente');
  })
  .catch(err => {
    console.error('❌ Error conectando a PostgreSQL:', err.message);
  });

module.exports = {
  query,
  end: () => pool.end(),
  pool,
};
