const { join } = require("path");

// Chrome de Puppeteer dentro del proyecto: en Render solo se conserva la
// carpeta del proyecto entre el build y la ejecución (~/.cache se pierde y los
// PDF fallan con "Could not find Chrome").
module.exports = {
  cacheDirectory: join(__dirname, ".cache", "puppeteer"),
};
