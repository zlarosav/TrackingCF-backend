require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (query) => {
  return new Promise(resolve => rl.question(query, resolve));
};

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'tracking_cf',
  port: process.env.DB_PORT || 3306
};

async function createAdmin() {
  let connection;
  try {
    console.log('\n--- Crear Nuevo Administrador ---\n');
    
    const username = await askQuestion('Usuario: ');
    if (!username) {
      console.error('El usuario es requerido.');
      process.exit(1);
    }

    const password = await askQuestion('Contraseña: ');
    if (!password) {
      console.error('La contraseña es requerida.');
      process.exit(1);
    }

    console.log('\nConectando a la base de datos...');
    connection = await mysql.createConnection(dbConfig);

    // Check if user exists
    const [existing] = await connection.query('SELECT id FROM admins WHERE username = ?', [username]);
    if (existing.length > 0) {
      console.error(`\nError: El usuario "${username}" ya existe.`);
      process.exit(1);
    }

    // Hash password
    console.log('Generando hash...');
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Insert
    await connection.query('INSERT INTO admins (username, password_hash) VALUES (?, ?)', [username, passwordHash]);
    
    console.log(`\n✅ Administrador "${username}" creado exitosamente.`);

  } catch (error) {
    console.error('\nError:', error.message);
  } finally {
    if (connection) await connection.end();
    rl.close();
    process.exit(0);
  }
}

createAdmin();
