require('dotenv').config();
const db = require('../config/database');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function toggleUser() {
  try {
    console.log('🔄 Habilitar/Inhabilitar usuario\n');

    // Solicitar handle
    const handle = await question('Handle del usuario: ');
    
    if (!handle) {
      console.log('❌ Debes proporcionar un handle');
      rl.close();
      process.exit(1);
    }

    // Verificar que existe en DB
    const [users] = await db.query(
      'SELECT id, handle, enabled FROM users WHERE handle = ?',
      [handle]
    );

    if (users.length === 0) {
      console.log(`❌ El usuario '${handle}' no existe en la base de datos`);
      rl.close();
      process.exit(1);
    }

    const user = users[0];
    const currentStatus = user.enabled ? 'Habilitado ✅' : 'Inhabilitado ❌';
    const newStatus = user.enabled ? 'Inhabilitado ❌' : 'Habilitado ✅';

    console.log(`\nEstado actual: ${currentStatus}`);

    // Confirmación
    const confirmation = await question(`\n¿Cambiar a ${newStatus}? (si/no): `);
    
    if (confirmation.toLowerCase() !== 'si') {
      console.log('❌ Operación cancelada');
      rl.close();
      process.exit(0);
    }

    // Toggle enabled
    const newEnabledValue = !user.enabled;
    await db.query(
      'UPDATE users SET enabled = ? WHERE id = ?',
      [newEnabledValue, user.id]
    );

    console.log(`\n✅ Usuario '${handle}' ahora está: ${newStatus}`);
    
    if (!newEnabledValue) {
      console.log(`\n💡 El usuario no aparecerá en las tablas ni estará accesible hasta que lo habilites nuevamente`);
    }

    rl.close();
    process.exit(0);

  } catch (err) {
    console.error('❌ Error cambiando estado de usuario:', err.message);
    rl.close();
    process.exit(1);
  }
}

toggleUser();
