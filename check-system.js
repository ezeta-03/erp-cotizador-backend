console.log('🔍 Verificación rápida del sistema\n');

// Verificar variables de entorno críticas
const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'NODE_ENV'
];

console.log('📋 Variables de entorno:');
requiredEnvVars.forEach(envVar => {
  const value = process.env[envVar];
  if (value) {
    if (envVar === 'DATABASE_URL') {
      // Mostrar solo el inicio de la URL por seguridad
      const masked = value.replace(/:([^:@]{4})[^:@]*@/, ':****@');
      console.log(`   ✅ ${envVar}: ${masked}`);
    } else {
      console.log(`   ✅ ${envVar}: configurado`);
    }
  } else {
    console.log(`   ❌ ${envVar}: NO CONFIGURADO`);
  }
});

// Verificar Node.js
console.log(`\n🟢 Node.js: ${process.version}`);
console.log(`📍 Plataforma: ${process.platform}`);
console.log(`🏗️ Entorno: ${process.env.NODE_ENV || 'development'}`);

// Verificar memoria
const memUsage = process.memoryUsage();
console.log(`\n💾 Memoria:`);
console.log(`   - Usada: ${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`);
console.log(`   - Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`);
console.log(`   - Externa: ${Math.round(memUsage.external / 1024 / 1024)} MB`);

// Verificar que los archivos críticos existan
const fs = require('fs');
const criticalFiles = [
  'prisma/schema.prisma',
  'src/server.js',
  'package.json'
];

console.log(`\n📁 Archivos críticos:`);
criticalFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`   ✅ ${file}`);
  } else {
    console.log(`   ❌ ${file} - NO ENCONTRADO`);
  }
});

console.log('\n🏁 Verificación completada');