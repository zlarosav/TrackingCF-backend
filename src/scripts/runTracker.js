require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { trackAllUsers, trackUser } = require('../services/trackerService');

async function runTracker() {
  try {
    const args = process.argv.slice(2);
    const specificHandle = args.find(arg => !arg.startsWith('--'));
    const isForce = args.includes('--force');

    console.log('🚀 Iniciando tracking manual...\n');

    if (specificHandle) {
      // Trackear usuario específico
      console.log(`🎯 Trackeando usuario específico: ${specificHandle}`);
      const result = await trackUser(specificHandle);

      if (result.error) {
        console.error(`\n❌ Error: ${result.error}`);
        process.exit(1);
      } else {
        console.log(`\n✅ Tracking completado: ${result.newSubmissions} nuevas submissions`);
      }
    } else {
      // Trackear todos los usuarios
      console.log('📊 Trackeando todos los usuarios...');
      const results = await trackAllUsers();

      console.log('\n📈 Resumen:');
      results.forEach(r => {
        const status = r.error ? '❌' : '✅';
        const msg = r.error ? `Error: ${r.error}` : `${r.newSubmissions} nuevas`;
        console.log(`${status} ${r.handle}: ${msg}`);
      });
    }

    console.log('\n✨ Proceso completado');
    process.exit(0);

  } catch (err) {
    console.error('❌ Error ejecutando tracker:', err.message);
    process.exit(1);
  }
}

runTracker();
