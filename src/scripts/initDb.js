require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function initDatabase() {
  let connection;
  
  try {
    console.log('🔧 Inicializando base de datos...\n');

    // Primero conectarse SIN especificar base de datos
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      charset: 'utf8mb4'
    });

    console.log('✅ Conectado a MySQL');

    const dbName = process.env.DB_NAME || 'tracking_cf';

    // Crear base de datos si no existe
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`✅ Base de datos '${dbName}' creada/verificada`);

    // Seleccionar la base de datos
    await connection.query(`USE ${dbName}`);
    console.log(`✅ Base de datos seleccionada\n`);

    // Leer el schema
    const schemaPath = path.join(__dirname, '../../schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Eliminar comentarios y dividir por statements
    const cleanedSchema = schema
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');

    const statements = cleanedSchema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .filter(s => !s.includes('CREATE DATABASE') && !s.includes('USE '));

    console.log(`📋 Ejecutando ${statements.length} statements...\n`);

    for (const statement of statements) {
      try {
        await connection.query(statement);
        
        if (statement.includes('CREATE TABLE')) {
          const match = statement.match(/CREATE TABLE.*?(?:IF NOT EXISTS)?\s+`?(\w+)`?/i);
          const tableName = match ? match[1] : 'desconocida';
          console.log(`✅ Tabla '${tableName}' creada`);
        }
      } catch (err) {
        console.error(`❌ Error ejecutando statement:`, err.message);
        console.error(`Statement: ${statement.substring(0, 100)}...`);
      }
    }

    console.log('\n✅ Base de datos inicializada correctamente');
    await connection.end();
    process.exit(0);

  } catch (err) {
    console.error('❌ Error inicializando base de datos:', err.message);
    if (connection) await connection.end();
    process.exit(1);
  }
}

initDatabase();
