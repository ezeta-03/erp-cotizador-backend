const readline = require('readline');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function updateSupabaseConfig() {
  console.log('🔧 Asistente de Configuración de Supabase\n');

  console.log('📋 PASOS PARA OBTENER LA NUEVA DATABASE_URL:');
  console.log('   1. Ve a https://supabase.com/dashboard');
  console.log('   2. Selecciona tu proyecto activo');
  console.log('   3. Ve a Settings → Database');
  console.log('   4. Copia la "Connection string" de "Connection pooling"');
  console.log('   5. Asegúrate de que termine con ?sslmode=require\n');

  const newDatabaseUrl = await askQuestion('📝 Pega aquí tu nueva DATABASE_URL de Supabase: ');

  if (!newDatabaseUrl || !newDatabaseUrl.startsWith('postgresql://')) {
    console.log('❌ URL inválida. Debe comenzar con "postgresql://"');
    rl.close();
    return;
  }

  // Leer el archivo .env actual
  const envPath = path.join(__dirname, '.env');
  let envContent = fs.readFileSync(envPath, 'utf8');

  // Reemplazar la DATABASE_URL
  const oldUrlMatch = envContent.match(/DATABASE_URL=.*/);
  if (oldUrlMatch) {
    envContent = envContent.replace(oldUrlMatch[0], `DATABASE_URL=${newDatabaseUrl}`);
  } else {
    envContent += `\nDATABASE_URL=${newDatabaseUrl}`;
  }

  // Guardar el archivo
  fs.writeFileSync(envPath, envContent);

  console.log('\n✅ Archivo .env actualizado exitosamente!');
  console.log(`🔗 Nueva DATABASE_URL: ${newDatabaseUrl}`);

  console.log('\n🔍 Verificando la nueva configuración...');

  // Verificar la conexión
  const { exec } = require('child_process');
  exec('node verify-supabase-project.js', (error, stdout, stderr) => {
    console.log(stdout);
    if (error) {
      console.log('\n⚠️ Verificación completada. Si hay errores, revisa la URL.');
    } else {
      console.log('\n🎉 ¡Configuración exitosa! Ahora puedes ejecutar:');
      console.log('   npm run setup-production');
    }
    rl.close();
  });
}

updateSupabaseConfig();