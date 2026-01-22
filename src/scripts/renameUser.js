require('dotenv').config();
const db = require('../config/database');
const codeforcesService = require('../services/codeforcesService');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function renameUser() {
  try {
    console.log('🔄 Renombrar usuario de Codeforces\n');

    // Solicitar handle actual
    const currentHandle = await question('Handle actual: ');
    
    if (!currentHandle) {
      console.log('❌ Debes proporcionar un handle');
      rl.close();
      process.exit(1);
    }

    // Verificar que existe en DB
    const [users] = await db.query(
      'SELECT id, handle FROM users WHERE handle = ?',
      [currentHandle]
    );

    if (users.length === 0) {
      console.log(`❌ El usuario '${currentHandle}' no existe en la base de datos`);
      rl.close();
      process.exit(1);
    }

    const userId = users[0].id;
    console.log(`✅ Usuario encontrado en DB (ID: ${userId})`);

    // Solicitar nuevo handle
    const newHandle = await question('Nuevo handle: ');
    
    if (!newHandle) {
      console.log('❌ Debes proporcionar un nuevo handle');
      rl.close();
      process.exit(1);
    }

    // Validar que el nuevo handle existe en Codeforces
    console.log(`\n🔍 Verificando que '${newHandle}' existe en Codeforces...`);
    
    try {
      const userInfo = await codeforcesService.getUserInfo(newHandle);
      console.log(`✅ Usuario encontrado en Codeforces: ${userInfo.handle}`);
      console.log(`   Rating: ${userInfo.rating || 'Sin rating'} (${userInfo.rank || 'unrated'})`);
    } catch (err) {
      console.log(`❌ Error: El usuario '${newHandle}' no existe en Codeforces`);
      console.log(`   Detalle: ${err.message}`);
      rl.close();
      process.exit(1);
    }

    // Confirmación
    const confirmation = await question(`\n⚠️  Confirmar cambio de '${currentHandle}' → '${newHandle}'? (si/no): `);
    
    if (confirmation.toLowerCase() !== 'si') {
      console.log('❌ Operación cancelada');
      rl.close();
      process.exit(0);
    }

    // Actualizar handle en DB
    await db.query(
      'UPDATE users SET handle = ? WHERE id = ?',
      [newHandle, userId]
    );

    console.log(`\n✅ Usuario renombrado exitosamente`);
    console.log(`   ${currentHandle} → ${newHandle}`);
    console.log(`\n💡 Todas las submissions y estadísticas se mantuvieron asociadas al usuario`);

    rl.close();
    process.exit(0);

  } catch (err) {
    console.error('❌ Error renombrando usuario:', err.message);
    rl.close();
    process.exit(1);
  }
}

renameUser();
