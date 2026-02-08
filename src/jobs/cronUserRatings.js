const cron = require('node-cron');
const { DateTime } = require('luxon');
const User = require('../models/User');
const codeforcesService = require('../services/codeforcesService');
const { updateContests } = require('../services/contestService');
const db = require('../config/database');

// Cron job: Todos los días a las 01:00 AM (hora Lima)
// User req: "A la 1AM de todos los días, será lo único que actualice los datos" (User Ratings)
cron.schedule('0 1 * * *', async () => {
  try {
    const nowLima = DateTime.now().setZone('America/Lima');
    console.log(`\n📊 Ejecutando actualización de historial de ratings [${nowLima.toFormat('HH:mm')} Lima]`);
    
    // 1. Sync ALL Contests (Global) first
    // This ensures we have the ID, Name, Phase of any new contest in our DB
    console.log('🔄 Syncing Codeforces Contests (Global List)...');
    await updateContests();
    console.log('✅ Global Contests synced.');

    // 2. Obtener todos los usuarios
    
    // Obtener todos los usuarios
    const users = await User.findAll();
    console.log(`🔍 Encontrados ${users.length} usuarios para actualizar.`);

    let successCount = 0;
    let errorCount = 0;

    for (const user of users) {
        try {
            // Fetch Enriched History directly
            const richHistory = await codeforcesService.getEnrichedRatingHistory(user.handle);
            
            // Save to DB
            await User.updateRatingHistory(user.id, richHistory);
            successCount++;
            
            // Pausa para no saturar la API
            await new Promise(resolve => setTimeout(resolve, 500));

        } catch (uErr) {
            console.error(`❌ Error actualizando ${user.handle}: ${uErr.message}`);
            errorCount++;
        }
    }
    
    console.log(`✅ Actualización de ratings completada: ${successCount} éxitos, ${errorCount} errores.\n`);
  } catch (err) {
    console.error('❌ Error en cron job de user ratings:', err.message);
  }
}, {
    timezone: "America/Lima" 
});

console.log('⏰ Cron job de historial de ratings configurado (01:00 AM Lima)');
