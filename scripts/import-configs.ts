// scripts/import-configs.ts
// Importa configs JSON del pipeline antiguo como proyectos de Ad Studio
// Uso: npx tsx scripts/import-configs.ts <directorio-configs>
import fs from 'fs';
import path from 'path';
import { importLegacyConfig } from '../lib/store';

const configDir = process.argv[2] || path.join(__dirname, '../../ADS/configs');

if (!fs.existsSync(configDir)) {
  console.error(`Directorio no encontrado: ${configDir}`);
  process.exit(1);
}

const configs = fs.readdirSync(configDir).filter(f => f.endsWith('.json'));
console.log(`Importando ${configs.length} configs de ${configDir}…\n`);

for (const file of configs) {
  const fullPath = path.join(configDir, file);
  const name = file.replace('.json', '').replace(/-/g, ' ');
  try {
    const project = importLegacyConfig(fullPath, name);
    console.log(`✓ ${project.name} → ${project.id}`);
  } catch (e) {
    console.error(`✗ ${file}:`, e);
  }
}

console.log('\n✅ Hecho. Abre http://localhost:3000 para verlos.');
