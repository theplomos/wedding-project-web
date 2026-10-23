const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: ['.env.local', '.env'] });

const connectionString =
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DIRECT_URL;
if (!connectionString) {
  console.error('El string de conexión a la base de datos no está configurado en .env.');
  process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// KEEP IN SYNC with src/lib/normalize-name.ts
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9\s]/g, "") // remove special characters
    .replace(/\s+/g, " ") // collapse internal whitespace runs
    .trim();
}

async function main() {
  const jsonPath = path.join(__dirname, '../guests_cleaned.json');
  const csvPath = path.join(__dirname, '../guests.csv');

  let guestsToLoad = [];

  if (fs.existsSync(jsonPath)) {
    guestsToLoad = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  } else if (fs.existsSync(csvPath)) {
    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = fileContent.split('\n');
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      // CSV format: "partyName",partySizeMax,"nickname"
      const match = line.match(/^"?([^",]+)"?,\s*(\d+)(?:,\s*"?([^",]*)"?)?$/);
      if (match) {
        const partyName = match[1].trim();
        const partySizeMax = parseInt(match[2]) || 1;
        const nickname = (match[3] || partyName.split(' ')[0]).trim();
        const searchableName = normalizeName(partyName);
        const id = searchableName.replace(/\s+/g, '-');
        guestsToLoad.push({ id, partyName, searchableName, nickname, partySizeMax });
      }
    }
  } else {
    console.error('No se encontró guests_cleaned.json ni guests.csv');
    process.exit(1);
  }

  console.log(`🧹 Limpiando datos previos de prueba en la base de datos...`);
  // Eliminar datos dependientes primero si existieran
  await prisma.rSVP.deleteMany();
  await prisma.anecdote.deleteMany();
  await prisma.spotifySuggestion.deleteMany();
  await prisma.reminderLog.deleteMany();
  await prisma.guest.deleteMany();
  console.log(`Base de datos limpiada con éxito.`);

  console.log(`🌱 Iniciando siembra de ${guestsToLoad.length} invitados reales...`);
  let count = 0;

  for (const guest of guestsToLoad) {
    const { id, partyName, searchableName, nickname, partySizeMax } = guest;

    await prisma.guest.create({
      data: {
        id,
        partyName,
        searchableName,
        nickname: nickname || null,
        partySizeMax: partySizeMax || 1,
        status: 'PENDING',
        notPreloaded: false
      }
    });

    console.log(`✅ Invitado registrado: ${partyName} (Apodo: ${nickname || '-'}, Max: ${partySizeMax})`);
    count++;
  }

  console.log(`\n🎉 Siembra completada. Se registraron ${count} invitados en la base de datos.`);
}

main()
  .catch((e) => {
    console.error('Error durante la siembra:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
