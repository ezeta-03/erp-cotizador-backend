const { execSync } = require('child_process');
const fs = require('fs');

async function setupLocalDatabase() {
  console.log('🏠 Configurando base de datos LOCAL (SQLite para desarrollo)\n');

  try {
    // Crear archivo .env.local si no existe
    const envLocalPath = '.env.local';
    if (!fs.existsSync(envLocalPath)) {
      console.log('📝 Creando .env.local para desarrollo...');
      const envLocalContent = `# Configuración para desarrollo local (SQLite)
DATABASE_URL="file:./dev.db"
JWT_SECRET=cotizaciones_mvp_desarrollo_local
NODE_ENV=development
PORT=4000
`;
      fs.writeFileSync(envLocalPath, envLocalContent);
      console.log('✅ .env.local creado');
    }

    // Generar cliente Prisma
    console.log('🔧 Generando cliente Prisma...');
    execSync('npx prisma generate', { stdio: 'inherit' });

    // Crear/resetear base de datos
    console.log('🗄️ Creando base de datos SQLite...');
    execSync('npx prisma migrate reset --force --skip-generate', { stdio: 'inherit' });

    // Ejecutar seeds
    console.log('🌱 Ejecutando seeds...');
    execSync('npm run seed:completo', { stdio: 'inherit' });

    // Verificar
    console.log('🔍 Verificando configuración...');
    execSync('npm run diagnostico-db', { stdio: 'inherit' });

    console.log('\n🎉 Base de datos local configurada exitosamente!');
    console.log('💡 Para desarrollo usa: npm run dev');
    console.log('💡 Para producción usa: npm run setup-production');

  } catch (error) {
    console.error('❌ Error configurando BD local:', error.message);
    console.log('\n💡 Solución: Borra dev.db y ejecuta nuevamente');
    process.exit(1);
  }
}

setupLocalDatabase();