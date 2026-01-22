require('dotenv').config();
const mysql = require('mysql2/promise');
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

    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      charset: 'utf8mb4'
    });

    console.log('\n✅ Conectado a MySQL');

    // Drop database
    await connection.query(`DROP DATABASE IF EXISTS ${dbName}`);
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
