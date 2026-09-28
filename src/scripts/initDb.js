require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function getPgConfig(database) {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database,
    options: '-c timezone=UTC',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  };
}

function quoteIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Nombre de base de datos inválido: ${identifier}`);
  }
  return `"${identifier}"`;
}

async function initDatabase() {
  let adminConnection;
  let connection;

  try {
    console.log('🔧 Inicializando base de datos...\n');

    const dbName = process.env.DB_NAME || 'tracking_cf';
    const quotedDbName = quoteIdentifier(dbName);

    // PostgreSQL crea las bases desde una conexión administrativa a postgres.
    adminConnection = new Client(getPgConfig(process.env.DB_ADMIN_DATABASE || 'postgres'));
    await adminConnection.connect();
    console.log('✅ Conectado a PostgreSQL');

    const { rows: databases } = await adminConnection.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName]
    );
    if (databases.length === 0) {
      await adminConnection.query(`CREATE DATABASE ${quotedDbName}`);
    }
    await adminConnection.end();
    adminConnection = null;
    console.log(`✅ Base de datos '${dbName}' creada/verificada`);

    // Ejecutar el esquema completo. No se divide por ';' porque PostgreSQL
    // usa funciones PL/pgSQL con cuerpos dollar-quoted.
    const schemaPath = path.join(__dirname, '../../schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    connection = new Client(getPgConfig(dbName));
    await connection.connect();
    await connection.query(schema);

    console.log('\n✅ Base de datos PostgreSQL inicializada correctamente');

    return { dbName };
  } finally {
    if (adminConnection) {
      await adminConnection.end();
    }
    if (connection) {
      await connection.end();
    }
  }
}

if (require.main === module) {
  initDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Error inicializando base de datos:', err.message);
      process.exit(1);
    });
}

module.exports = {
  initDatabase,
};
