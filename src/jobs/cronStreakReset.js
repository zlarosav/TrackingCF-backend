const cron = require('node-cron');
const { DateTime } = require('luxon');
const { resetExpiredStreaks, updateUserAvatars } = require('../services/streakResetService');

// Cron job: todos los días a las 00:00 (horario configurado en .env)
// Resetea las rachas de usuarios que no enviaron submissions ayer
// Actualiza avatares de todos los usuarios habilitados
cron.schedule('0 0 * * *', async () => {
  try {
    const tz = process.env.TZ || 'America/Lima';
    const nowLima = DateTime.now().setZone(tz);
    
    console.log(`\n⏰ Ejecutando tareas diarias [${nowLima.toFormat('HH:mm')} ${tz}]`);
    
    // Reset expired streaks
    await resetExpiredStreaks();
    
    // Update user avatars
    await updateUserAvatars();
    
    console.log(`✅ Tareas diarias completadas\n`);

  } catch (err) {
    console.error('❌ Error en cron job diario:', err.message);
  }
});

console.log('⏰ Cron job diario configurado (00:00 - reset rachas + actualizar avatares)');
