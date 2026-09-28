require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { Client } = require('pg');
const readline = require('readline');

async function deleteDatabase() {
  let connection;
  
  try {
    console.log('🗑️  Eliminando base de datos...\n');

    // Confirmación
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const dbName = process.env.DB_NAME || 'tracking_cf';

    await new Promise((resolve) => {
      rl.question(`⚠️  ¿Estás seguro de eliminar la base de datos '${dbName}'?\nEsta acción no se puede deshacer.\nEscribe 'DELETE' para confirmar: `, (answer) => {
        rl.close();
        if (answer !== 'DELETE') {
          console.log('\n❌ Operación cancelada');
          process.exit(0);
        }
        resolve();
      });
    });

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(dbName)) {
      throw new Error(`Nombre de base de datos inválido: ${dbName}`);
    }

    connection = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_ADMIN_DATABASE || 'postgres',
      options: '-c timezone=UTC',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });
    await connection.connect();

    console.log('\n✅ Conectado a PostgreSQL');

    // Drop database
    await connection.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    console.log(`✅ Base de datos '${dbName}' eliminada correctamente`);

    await connection.end();
    console.log('\n✅ Operación completada exitosamente\n');
    process.exit(0);

  } catch (err) {
    console.error('❌ Error eliminando base de datos:', err.message);
    if (connection) await connection.end();
    process.exit(1);
  }
}

deleteDatabase();
