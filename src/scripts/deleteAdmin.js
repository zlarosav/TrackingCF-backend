require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { Client } = require('pg');
const readline = require('readline');

async function deleteAdmin() {
  const username = process.argv[2];

  if (!username) {
    console.error('❌ Error: Debes proporcionar el nombre de usuario.');
    console.log('Uso: npm run admin:delete <username>');
    process.exit(1);
  }

  let connection;
  try {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    await new Promise((resolve) => {
      rl.question(`⚠️  ¿Estás seguro de eliminar al administrador '${username}'?\nEscribe 'DELETE' para confirmar: `, (answer) => {
        rl.close();
        if (answer !== 'DELETE') {
          console.log('\n❌ Operación cancelada');
          process.exit(0);
        }
        resolve();
      });
    });

    connection = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'tracking_cf',
      options: '-c timezone=UTC',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });
    await connection.connect();

    const result = await connection.query('DELETE FROM admins WHERE username = $1', [username]);

    if (result.rowCount === 0) {
      console.log(`❌ No se encontró el administrador '${username}'`);
    } else {
      console.log(`✅ Administrador '${username}' eliminado exitosamente`);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    if (connection) await connection.end();
    process.exit(0);
  }
}

deleteAdmin();
