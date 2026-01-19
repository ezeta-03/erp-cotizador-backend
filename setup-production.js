const { execSync } = require('child_process');
const fs = require('fs');

async function setupProductionDatabase() {
  console.log('🚀 Configurando base de datos para producción...\n');

  try {
    // Verificar que DATABASE_URL esté configurada
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL no está configurada');
    }

    console.log('✅ DATABASE_URL encontrada');

    // Generar cliente Prisma
    console.log('🔧 Generando cliente Prisma...');
    execSync('npx prisma generate', { stdio: 'inherit' });
    console.log('✅ Cliente Prisma generado');

    // Ejecutar migraciones
    console.log('📦 Ejecutando migraciones...');
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    console.log('✅ Migraciones ejecutadas');

    // Ejecutar seeds
    console.log('🌱 Ejecutando seeds...');
    execSync('npm run seed:completo', { stdio: 'inherit' });
    console.log('✅ Seeds ejecutados');

    // Verificar conexión
    console.log('🔍 Verificando conexión...');
    execSync('npm run diagnostico-db', { stdio: 'inherit' });

    console.log('\n🎉 Base de datos configurada exitosamente para producción!');

  } catch (error) {
    console.error('❌ Error configurando base de datos:', error.message);
    console.log('\n💡 Posibles soluciones:');
    console.log('   1. Verificar que la DATABASE_URL de Supabase sea correcta');
    console.log('   2. Asegurarse de que el proyecto Supabase esté activo');
    console.log('   3. Verificar que la base de datos esté creada en Supabase');
    console.log('   4. Revisar las credenciales de conexión');
    process.exit(1);
  }
}

setupProductionDatabase();