require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const readline = require('readline');
const { initDatabase } = require('./initDb');

const REQUIRED_ENV = [
  'DB_HOST',
  'DB_USER',
  'DB_NAME',
  'API_KEY_CF',
  'API_SECRET_CF',
  'JWT_SECRET',
];

function parseArgs(argv) {
  const flags = {};

  argv.forEach((arg) => {
    if (!arg.startsWith('--')) return;
    const [rawKey, ...rawValue] = arg.slice(2).split('=');
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    flags[key] = rawValue.length > 0 ? rawValue.join('=') : true;
  });

  return flags;
}

function printHelp() {
  console.log(`
TrackingCF setup

Uso:
  npm run setup
  npm run setup -- --admin-user=admin --admin-password=secret --users=zlarosav,zxpty
  npm run setup -- --admin-user=admin --admin-password=secret --skip-users

Flags:
  --admin-user=<username>       Usuario del primer administrador
  --admin-password=<password>   Contraseña del primer administrador
  --users=<handles>             Handles iniciales separados por comas
  --skip-users                  No crear usuarios iniciales
`);
}

function validateEnv() {
  const missing = REQUIRED_ENV.filter((key) => !String(process.env[key] || '').trim());

  if (missing.length === 0) return;

  console.error('\n❌ Faltan variables de entorno requeridas:');
  missing.forEach((key) => console.error(`   - ${key}`));
  console.error('\nCopia .env.example a .env y completa los valores antes de ejecutar setup.');
  console.error('GEMINI_API_KEY es opcional, pero Codeforces API y JWT_SECRET son requeridos.\n');
  process.exit(1);
}

function parseHandles(value) {
  return Array.from(
    new Set(
      String(value || '')
        .split(',')
        .map((handle) => handle.trim())
        .filter(Boolean)
    )
  );
}

async function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function createUserLogger(handle) {
  return {
    info: (message) => console.log(`   [${handle}] ${message}`),
    warn: (message) => console.warn(`   [${handle}] ${message}`),
  };
}

async function setupAdmin({ flags, rl, interactive, adminService }) {
  const totalAdmins = await adminService.countAdmins();

  if (totalAdmins > 0) {
    console.log(`✅ Ya existen ${totalAdmins} administrador(es). Saltando creación de admin.`);
    return { skipped: true };
  }

  let username = flags.adminUser;
  let password = flags.adminPassword;

  if ((!username || !password) && !interactive) {
    throw new Error('No existen admins. En modo no interactivo usa --admin-user y --admin-password.');
  }

  console.log('\n👤 Crea el primer administrador para entrar a /consola.');

  if (!username) username = await ask(rl, 'Usuario admin: ');
  if (!password) password = await ask(rl, 'Contraseña admin: ');

  const admin = await adminService.createAdmin({ username, password });
  console.log(`✅ Administrador "${admin.username}" creado.`);
  return { skipped: false, admin };
}

async function setupUsers({ flags, rl, interactive, userService }) {
  if (flags.skipUsers) {
    console.log('✅ Creación de usuarios iniciales omitida por --skip-users.');
    return { created: [], failed: [], skipped: true };
  }

  let handles = parseHandles(flags.users);

  if (handles.length === 0 && interactive) {
    const answer = await ask(
      rl,
      '\nHandles iniciales de Codeforces separados por comas (Enter para omitir): '
    );
    handles = parseHandles(answer);
  }

  if (handles.length === 0) {
    console.log('✅ No se crearán usuarios iniciales. Podrás agregarlos luego desde /consola.');
    return { created: [], failed: [], skipped: true };
  }

  const created = [];
  const failed = [];

  console.log(`\n👥 Creando ${handles.length} usuario(s) inicial(es)...`);

  for (const handle of handles) {
    try {
      const result = await userService.createTrackedUser({
        handle,
        logger: createUserLogger(handle),
      });

      created.push(result);
      console.log(`   ✅ ${result.handle}: ${result.newSubmissions} submissions, racha ${result.streak}`);
    } catch (error) {
      failed.push({ handle, error: error.message });
      console.error(`   ❌ ${handle}: ${error.message}`);
    }
  }

  return { created, failed, skipped: false };
}

async function run() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help || flags.h) {
    printHelp();
    return;
  }

  validateEnv();

  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let db;

  try {
    console.log('\n🚀 TrackingCF Backend Setup\n');
    await initDatabase();

    const adminService = require('../services/adminProvisioningService');
    const userService = require('../services/userProvisioningService');
    db = require('../config/database');

    await setupAdmin({ flags, rl, interactive, adminService });
    const userSummary = await setupUsers({ flags, rl, interactive, userService });

    console.log('\n🎉 Setup completado.\n');
    console.log('Siguientes pasos:');
    console.log('1. Inicia el backend con: npm start');
    console.log('2. Configura el frontend con: NEXT_PUBLIC_API_URL=https://tu-backend.com/api');
    console.log('3. Despliega el frontend y entra a /consola para gestionar usuarios.');

    if (userSummary.failed.length > 0) {
      console.log('\nUsuarios que no se pudieron crear:');
      userSummary.failed.forEach((item) => console.log(`- ${item.handle}: ${item.error}`));
    }
  } catch (error) {
    console.error('\n❌ Setup falló:', error.message);
    process.exitCode = 1;
  } finally {
    rl.close();
    if (db) await db.end();
  }
}

run();
