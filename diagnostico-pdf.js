const puppeteer = require('puppeteer');
const os = require('os');

async function diagnosticarSistema() {
  console.log('🔍 Diagnóstico del sistema para generación de PDFs\n');

  // Información del sistema
  console.log('📊 Información del sistema:');
  console.log(`   Plataforma: ${process.platform}`);
  console.log(`   Arquitectura: ${process.arch}`);
  console.log(`   Memoria total: ${Math.round(os.totalmem() / 1024 / 1024)} MB`);
  console.log(`   Memoria libre: ${Math.round(os.freemem() / 1024 / 1024)} MB`);
  console.log(`   CPUs: ${os.cpus().length}`);
  console.log(`   Node.js: ${process.version}`);
  console.log(`   Entorno: ${process.env.NODE_ENV || 'development'}\n`);

  // Variables de entorno de Puppeteer
  console.log('🔧 Variables de entorno de Puppeteer:');
  console.log(`   PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: ${process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD || 'no definido'}`);
  console.log(`   PUPPETEER_EXECUTABLE_PATH: ${process.env.PUPPETEER_EXECUTABLE_PATH || 'no definido'}\n`);

  // Verificar si Chromium está disponible
  console.log('🌐 Verificando disponibilidad de Chromium...');
  const { execSync } = require('child_process');

  try {
    const chromiumPath = process.env.PUPPETEER_EXECUTABLE_PATH || 'chromium-browser';
    const version = execSync(`${chromiumPath} --version`, { encoding: 'utf8' });
    console.log(`   ✅ Chromium encontrado: ${version.trim()}`);
  } catch (error) {
    console.log('   ❌ Chromium no encontrado o no accesible');
    console.log(`   Error: ${error.message}`);
  }

  // Probar Puppeteer
  console.log('\n🚀 Probando Puppeteer...');

  let browser;
  try {
    console.log('   Intentando configuración completa...');
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ],
      timeout: 30000
    });
    console.log('   ✅ Puppeteer launched successfully');

    const page = await browser.newPage();
    await page.setContent('<h1>Test PDF</h1><p>Este es un PDF de prueba.</p>');

    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    console.log(`   ✅ PDF generado exitosamente (${pdf.length} bytes)`);

    await browser.close();

  } catch (error) {
    console.log('   ❌ Error con configuración completa:', error.message);

    // Intentar configuración mínima
    try {
      console.log('   Intentando configuración mínima...');
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        timeout: 30000
      });
      console.log('   ✅ Puppeteer launched with minimal config');

      const page = await browser.newPage();
      await page.setContent('<h1>Test PDF</h1><p>Configuración mínima.</p>');

      const pdf = await page.pdf({ format: 'A4' });
      console.log(`   ✅ PDF generado con configuración mínima (${pdf.length} bytes)`);

      await browser.close();

    } catch (minimalError) {
      console.log('   ❌ Error incluso con configuración mínima:', minimalError.message);
      console.log('\n💡 Recomendaciones:');
      console.log('   - Verificar que hay suficiente memoria (mínimo 512MB)');
      console.log('   - En Render, usar plan con al menos 1GB RAM');
      console.log('   - Considerar usar jsPDF en el frontend como alternativa');
    }
  }

  console.log('\n🏁 Diagnóstico completado');
}

diagnosticarSistema().catch(console.error);