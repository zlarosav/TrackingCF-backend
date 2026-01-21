require('dotenv').config();
const User = require('../models/User');

async function deleteUser() {
  try {
    const handle = process.argv[2];

    if (!handle) {
      console.error('❌ Error: Debes proporcionar un handle');
      console.log('Uso: npm run user:delete <handle>');
      console.log('Ejemplo: npm run user:delete zlarosav');
      process.exit(1);
    }

    // Verificar que el usuario existe
    const user = await User.findByHandle(handle);
    if (!user) {
      console.error(`❌ El usuario '${handle}' no existe en la base de datos`);
      process.exit(1);
    }

    // Confirmar eliminación
    console.log(`⚠️  ¿Estás seguro de eliminar al usuario '${handle}' y todas sus submissions?`);
    console.log('Esta acción no se puede deshacer.');
    console.log('Presiona Ctrl+C para cancelar o continúa...\n');

    // Esperar 3 segundos
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Eliminar usuario (CASCADE eliminará submissions y stats)
    const deleted = await User.delete(handle);

    if (deleted) {
      console.log(`✅ Usuario '${handle}' eliminado exitosamente`);
    } else {
      console.error(`❌ Error al eliminar usuario '${handle}'`);
      process.exit(1);
    }

    process.exit(0);

  } catch (err) {
    console.error('❌ Error eliminando usuario:', err.message);
    process.exit(1);
  }
}

deleteUser();
