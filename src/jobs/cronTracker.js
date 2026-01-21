const cron = require('node-cron');
const { DateTime } = require('luxon');
const { trackAllUsers } = require('../services/trackerService');

// Cron job: cada 30 minutos (en :00 y :30)
// Excluye horas 3-8 AM (horario Lima)
cron.schedule('0,30 * * * *', async () => {
  try {
    const nowLima = DateTime.now().setZone('America/Lima');
    const hour = nowLima.hour;

    // Descanso programado entre 3 AM y 8 AM
    if (hour >= 3 && hour < 8) {
      console.log(`⏸️  Descanso programado [${nowLima.toFormat('HH:mm')} Lima]`);
      return;
    }

    console.log(`\n🚀 Ejecutando tracking automático [${nowLima.toFormat('HH:mm')} Lima]`);
    await trackAllUsers();
    console.log(`✅ Tracking automático completado\n`);

  } catch (err) {
    console.error('❌ Error en cron job de tracking:', err.message);
  }
});

console.log('⏰ Cron job de tracking configurado (cada 30 min, excepto 3-8 AM Lima)');
