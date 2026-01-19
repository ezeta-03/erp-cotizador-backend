// test-puppeteer-production.js - Prueba Puppeteer en producción
const puppeteer = require("puppeteer");

async function testPuppeteer() {
  console.log('🧪 Probando Puppeteer en entorno de producción...');
  console.log('📊 NODE_ENV:', process.env.NODE_ENV);
  console.log('🖥️ Plataforma:', process.platform);

  let browser = null;

  try {
    console.log('🚀 Intentando configuración completa...');
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
      timeout: 120000,
      ignoreHTTPSErrors: true
    });

    const page = await browser.newPage();
    await page.setContent('<h1>Test PDF</h1><p>Esto es una prueba</p>');
    const pdf = await page.pdf({ format: 'A4' });

    console.log('✅ PDF generado exitosamente, tamaño:', pdf.length, 'bytes');
    await browser.close();

  } catch (error) {
    console.error('❌ Error con configuración completa:', error.message);

    // Intentar configuración mínima
    try {
      console.log('🔄 Intentando configuración mínima...');
      if (browser) await browser.close();

      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        timeout: 60000
      });

      const page = await browser.newPage();
      await page.setContent('<h1>Test PDF Minimal</h1>');
      const pdf = await page.pdf({ format: 'A4' });

      console.log('✅ PDF generado con configuración mínima, tamaño:', pdf.length, 'bytes');
      await browser.close();

    } catch (minimalError) {
      console.error('❌ Error incluso con configuración mínima:', minimalError.message);
      console.error('💡 Posibles soluciones:');
      console.log('   - Verificar memoria disponible (mínimo 1GB)');
      console.log('   - Verificar que Chrome esté disponible');
      console.log('   - Considerar usar puppeteer-core con Chrome manual');
    }
  }
}

testPuppeteer().catch(console.error);