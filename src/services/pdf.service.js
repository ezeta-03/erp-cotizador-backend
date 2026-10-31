// HTML → PDF A4 con Puppeteer (mismas opciones que el PDF de cotizaciones).
const puppeteer = require("puppeteer");

async function htmlAPdf(html) {
  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      // --disable-dev-shm-usage: /dev/shm suele venir muy chico en hosting con
      // poca RAM (Render free tier) y Chrome se cae si no usa /tmp.
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      timeout: 120000,
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    // page.pdf() devuelve un Uint8Array: se envuelve en Buffer para que Express lo mande como binario.
    return Buffer.from(await page.pdf({ format: "A4", printBackground: true }));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = { htmlAPdf };
