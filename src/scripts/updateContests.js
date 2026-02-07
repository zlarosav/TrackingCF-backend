const { updateContests } = require('./services/contestService');

async function runContests() {
  try {
    console.log('🔄 Actualizando contests...\n');
    await updateContests();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error actualizando contests:', error.message);
    process.exit(1);
  }
}

runContests();
