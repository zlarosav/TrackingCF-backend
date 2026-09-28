require('dotenv').config();

const db = require('../config/database');
const normalizeCodeforcesAvatarUrl = require('../utils/normalizeCodeforcesAvatarUrl');

async function main() {
  const [users] = await db.query(
    'SELECT id, handle, avatar_url FROM users WHERE avatar_url IS NOT NULL'
  );

  let updated = 0;

  for (const user of users) {
    const avatarUrl = normalizeCodeforcesAvatarUrl(user.avatar_url);
    if (!avatarUrl || avatarUrl === user.avatar_url) continue;

    await db.query(
      'UPDATE users SET avatar_url = $1 WHERE id = $2',
      [avatarUrl, user.id]
    );
    updated++;
    console.log(`✅ ${user.handle}: avatar normalizado`);
  }

  console.log(`\n✅ Avatares actualizados: ${updated}/${users.length}`);
}

main()
  .catch((error) => {
    console.error('❌ Error normalizando avatares:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
