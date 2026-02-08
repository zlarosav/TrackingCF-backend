const cron = require('node-cron');
const { DateTime } = require('luxon');
const { updateContests, getUpcomingContests } = require('../services/contestService');
const { createNotification } = require('../services/notificationService');

// Cron job: Todos los días a las 03:00 AM (hora Lima)
// "30 3 * * *" -> para asegurar no conflicto con reinicios o simplemente 0 3
// User req: "Regrésalo a como estaba antes" (Global Contests)
cron.schedule('0 3 * * *', async () => {
  try {
    const nowLima = DateTime.now().setZone('America/Lima');
    console.log(`\n🏆 Ejecutando actualización de contests [${nowLima.toFormat('HH:mm')} Lima]`);
    
    await updateContests();

    // Check for upcoming contests in the next 24 hours
    const upcoming = await getUpcomingContests(24);
    if (upcoming && upcoming.length > 0) {
        for (const contest of upcoming) {
            // Create notification
            const startTime = DateTime.fromSeconds(contest.startTimeSeconds).setZone('America/Lima').toFormat('HH:mm');
            await createNotification(
                'CONTEST', 
                `🏆 ${contest.name} comienza hoy a las ${startTime}`, 
                contest.id
            );
        }
    }
    
    console.log(`✅ Actualización de contests completada\n`);
  } catch (err) {
    console.error('❌ Error en cron job de contests:', err.message);
  }
}, {
    timezone: "America/Lima" 
});

console.log('⏰ Cron job de contests configurado (03:00 AM Lima)');
