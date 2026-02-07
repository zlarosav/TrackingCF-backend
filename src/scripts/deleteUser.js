require('dotenv').config();
const User = require('../models/User');
const db = require('../config/database');

async function deleteUser() {
  const handle = process.argv[2];

  if (!handle) {
    console.error('❌ Error: Debes proporcionar un handle');
    console.log('Uso: node src/scripts/deleteUser.js <handle>');
    process.exit(1);
  }

  try {
    console.log(`🗑️  Eliminando usuario: ${handle}...`);
    
    // Verificar si existe antes (opcional, para mensaje más claro)
    const user = await User.findByHandle(handle);
    if (!user) {
        console.log(`⚠️  El usuario '${handle}' no existe en la base de datos.`);
        process.exit(0);
    }

    const deleted = await User.delete(handle);

    if (deleted) {
      console.log(`✅ Usuario '${handle}' y sus datos relacionados han sido eliminados.`);
    } else {
      console.log(`⚠️  No se pudo eliminar el usuario (posiblemente ya no exista).`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error eliminando usuario:', error.message);
    process.exit(1);
  }
}

deleteUser();
