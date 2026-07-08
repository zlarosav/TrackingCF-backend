require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const readline = require('readline');
const db = require('../config/database');
const { createAdmin } = require('../services/adminProvisioningService');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (query) => new Promise(resolve => rl.question(query, resolve));

async function run() {
  try {
    console.log('\n--- Crear Nuevo Administrador ---\n');

    const username = await askQuestion('Usuario: ');
    const password = await askQuestion('Contraseña: ');

    console.log('\nCreando administrador...');
    const admin = await createAdmin({ username, password });

    console.log(`\n✅ Administrador "${admin.username}" creado exitosamente.`);
    process.exitCode = 0;
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exitCode = 1;
  } finally {
    rl.close();
    await db.end();
  }
}

run();
