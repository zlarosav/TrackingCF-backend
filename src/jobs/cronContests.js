const cron = require('node-cron');
const { DateTime } = require('luxon');
const { updateContests } = require('../services/contestService');

// Cron job: Todos los días a las 03:00 AM (hora Lima)
// "30 3 * * *" -> para asegurar no conflicto con reinicios o simplemente 0 3
// User req: "03:00 de cada día"
cron.schedule('0 3 * * *', async () => {
  try {
    const nowLima = DateTime.now().setZone('America/Lima');
    console.log(`\n🏆 Ejecutando actualización de contests [${nowLima.toFormat('HH:mm')} Lima]`);
    
    await updateContests();
    
    console.log(`✅ Actualización de contests completada\n`);
  } catch (err) {
    console.error('❌ Error en cron job de contests:', err.message);
  }
}, {
    timezone: "America/Lima" 
});
// Note: node-cron supports timezone option, which simplifies handling "03:00 Lima" regardless of server time.
// If node-cron version is old, explicit offset check inside callback (like in cronTracker.js) works too.
// cronTracker.js uses manual check. Let's stick to simple schedule and maybe manual check if timezone arg fails, 
// but package.json has "node-cron": "^3.0.3" which supports timezone.
// However, to be consistent with existing cronTracker, I will rely on the schedule string + timezone option if possible, 
// or just standard server time with offset logic?
// cronTracker logic: `cron.schedule('0,30 * * * *', ...)` and checks `nowLima.hour`.
// For 3:00 specifically, `0 3 * * *` runs at 3am SERVER time. 
// If User wants 3am LIMA, and Server is UTC, that's 8am UTC (Lima is UTC-5).
// The user explicitly mentioned "hablando en idioma Lima/Peru".
// Let's use the timezone option for safety if available, or just convert. 
// Given the user prompt specifically mentions "process.env.TZ", I should respect that too.
// Server.js shows: `console.log(🌍 Timezone: ${process.env.TZ || 'UTC'});`
// So if the server is running with TZ=America/Lima, then `0 3 * * *` is fine.
// If TZ is UTC, then it runs at 3am UTC.
// I will assume TZ might be set, but adding timezone param to node-cron is safer if supported.
// "node-cron" 3.0.0+ supports it.

console.log('⏰ Cron job de contests configurado (03:00 AM Lima)');
