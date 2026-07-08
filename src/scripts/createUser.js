const db = require('../config/database');
const { createTrackedUser } = require('../services/userProvisioningService');

async function createUser() {
  try {
    const handle = process.argv[2];

    if (!handle) {
      console.error('❌ Error: Debes proporcionar un handle');
      console.log('Uso: npm run user:create <handle>');
      console.log('Ejemplo: npm run user:create zlarosav');
      process.exitCode = 1;
      return;
    }

    const result = await createTrackedUser({
      handle,
      logger: console,
    });

    if (result.trackError) {
      console.log(`⚠️  Error al obtener submissions: ${result.trackError}`);
    } else {
      console.log(`✅ ${result.newSubmissions} submissions obtenidas y guardadas`);
    }

    if (result.streak > 0) {
      console.log(`✅ Racha calculada: ${result.streak} días`);
    } else {
      console.log('📊 Sin racha activa');
    }

    if (result.warnings.length > 0) {
      console.log('\n⚠️  Advertencias:');
      result.warnings.forEach((warning) => console.log(`   - ${warning}`));
    }

    console.log(`\n🎉 Usuario '${result.handle}' creado y trackeado exitosamente`);
    process.exitCode = 0;
  } catch (err) {
    console.error('❌ Error creando usuario:', err.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

createUser();
