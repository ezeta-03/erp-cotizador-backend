const { execSync } = require('child_process');

console.log('🚀 Guía de Configuración de Supabase - Paso a Paso\n');

console.log('📋 PASO 1: Verificar tu proyecto Supabase');
console.log('   1. Ve a https://supabase.com/dashboard');
console.log('   2. Asegúrate de que tu proyecto esté ACTIVO (no pausado)');
console.log('   3. Si está pausado, actívalo desde el dashboard\n');

console.log('📋 PASO 2: Obtener DATABASE_URL correcta');
console.log('   1. En Supabase Dashboard → Settings → Database');
console.log('   2. Copia la "Connection string"');
console.log('   3. Debe terminar con ?sslmode=require');
console.log('   4. Actualiza tu .env con esta URL\n');

console.log('📋 PASO 3: Inicializar base de datos');
console.log('   Ejecuta este comando en tu terminal:\n');
console.log('   cd backend && npm run setup-production\n');

console.log('📋 PASO 4: Verificar que funciona');
console.log('   npm run diagnostico-db\n');

console.log('📋 PASO 5: Para producción (Render)');
console.log('   1. Push los cambios a GitHub');
console.log('   2. Render hará redeploy automáticamente');
console.log('   3. O ejecuta manualmente en Render: npm run setup-production\n');

console.log('🔧 Comandos disponibles:');
console.log('   npm run check-system     - Verificar configuración');
console.log('   npm run diagnostico-db    - Probar conexión BD');
console.log('   npm run setup-production  - Inicializar BD completa');
console.log('   npm run diagnostico-pdf   - Probar PDFs\n');

console.log('❓ Si sigues teniendo problemas:');
console.log('   1. Verifica que Supabase esté activo');
console.log('   2. Confirma la DATABASE_URL');
console.log('   3. Ejecuta: npm run setup-production');
console.log('   4. Si falla, contacta soporte\n');

console.log('🏁 Fin de la guía');