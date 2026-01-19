require('dotenv').config();

const https = require('https');

console.log('🔍 Verificación de Supabase\n');

// Extraer información de la DATABASE_URL
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.log('❌ No hay DATABASE_URL configurada');
  console.log('💡 Configura tu .env con la URL de Supabase');
  process.exit(1);
}

console.log('📋 Analizando DATABASE_URL...');

// Extraer el host de la URL
const urlMatch = databaseUrl.match(/@([^:]+):/);
if (!urlMatch) {
  console.log('❌ DATABASE_URL malformada');
  process.exit(1);
}

const host = urlMatch[1];
console.log(`🌐 Host detectado: ${host}`);

// Verificar conectividad básica
console.log('\n🔌 Probando conectividad básica...');

const testConnection = () => {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: host,
      port: 443,
      path: '/',
      method: 'GET',
      timeout: 5000
    }, (res) => {
      console.log(`✅ Conexión exitosa - Status: ${res.statusCode}`);
      resolve(true);
    });

    req.on('error', (err) => {
      console.log(`❌ Error de conexión: ${err.message}`);
      resolve(false);
    });

    req.on('timeout', () => {
      console.log('⏰ Timeout en conexión');
      req.destroy();
      resolve(false);
    });

    req.end();
  });
};

testConnection().then(() => {
  console.log('\n📝 Próximos pasos:');
  console.log('1. Si la conexión funciona, ejecuta: npm run setup-production');
  console.log('2. Si falla, verifica que tu proyecto Supabase esté activo');
  console.log('3. Confirma la DATABASE_URL en Supabase Dashboard');
  console.log('\n🏁 Verificación completada');
});