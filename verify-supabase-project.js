const https = require('https');
require('dotenv').config();

function checkSupabaseProject() {
  console.log('🔍 Verificación del Proyecto Supabase\n');

  // Extraer el project-ref de la DATABASE_URL
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('❌ No se encontró DATABASE_URL en las variables de entorno');
    return;
  }

  // Extraer el project-ref del host
  const urlMatch = databaseUrl.match(/postgres\.([a-zA-Z0-9]+):/);
  if (!urlMatch) {
    console.log('❌ No se pudo extraer el project-ref de la DATABASE_URL');
    console.log('💡 La URL debería tener el formato: postgresql://postgres.[project-ref]:...');
    return;
  }

  const projectRef = urlMatch[1];
  const supabaseUrl = `https://${projectRef}.supabase.co`;

  console.log(`🔗 URL del proyecto: ${supabaseUrl}`);
  console.log(`🆔 Project Ref: ${projectRef}\n`);

  // Hacer una petición HTTP para verificar si el proyecto existe
  const req = https.request(supabaseUrl, { method: 'HEAD' }, (res) => {
    console.log(`📡 Estado HTTP: ${res.statusCode}`);

    if (res.statusCode === 200 || res.statusCode === 404) {
      console.log('✅ El proyecto Supabase parece estar activo');
      console.log('\n💡 Si aún tienes errores de conexión:');
      console.log('   1. Verifica que la base de datos esté creada en Supabase Dashboard');
      console.log('   2. Asegúrate de que las credenciales sean correctas');
      console.log('   3. Revisa que no haya restricciones de IP');
    } else {
      console.log('⚠️ Respuesta inesperada del servidor');
    }
  });

  req.on('error', (err) => {
    console.log('❌ Error de conexión:');
    console.log(`   ${err.message}`);

    if (err.code === 'ENOTFOUND') {
      console.log('\n🔍 Diagnóstico: El proyecto Supabase no existe o no está activo');
      console.log('\n📋 Soluciones:');
      console.log('   1. Ve a https://supabase.com/dashboard');
      console.log('   2. Verifica que el proyecto esté creado y activo');
      console.log('   3. Si el proyecto no existe, créalo nuevamente');
      console.log('   4. Copia la nueva DATABASE_URL del dashboard');
      console.log('   5. Actualiza el archivo .env');
    } else {
      console.log('\n💡 Otros posibles problemas:');
      console.log('   - Firewall bloqueando la conexión');
      console.log('   - Credenciales incorrectas');
      console.log('   - Proyecto pausado por inactividad');
    }
  });

  req.setTimeout(10000, () => {
    console.log('⏰ Timeout: No se pudo conectar al proyecto Supabase');
    req.destroy();
  });

  req.end();
}

checkSupabaseProject();