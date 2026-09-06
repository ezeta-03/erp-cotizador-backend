const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const path = require("path");
const fs = require("fs");

let app = null;

// En Render, la credencial vive en la variable de entorno FIREBASE_SERVICE_ACCOUNT_JSON
// (el JSON completo de la cuenta de servicio, como texto). En local, se usa el archivo
// secrets/firebase-service-account.json (ignorado por git, nunca se commitea).
function cargarCredencial() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  const rutaLocal = path.join(__dirname, "..", "..", "secrets", "firebase-service-account.json");
  if (fs.existsSync(rutaLocal)) {
    return JSON.parse(fs.readFileSync(rutaLocal, "utf-8"));
  }
  return null;
}

// Inicialización perezosa: si no hay credencial configurada, getFirestoreProyectos()
// lanza en vez de romper el arranque del servidor (el resto del backend no depende de esto).
function getFirebaseApp() {
  if (app) return app;
  const credencial = cargarCredencial();
  if (!credencial) {
    throw new Error(
      "No se encontró credencial de Firebase (FIREBASE_SERVICE_ACCOUNT_JSON o secrets/firebase-service-account.json)"
    );
  }
  app = initializeApp({ credential: cert(credencial) });
  return app;
}

function getFirestoreProyectos() {
  return getFirestore(getFirebaseApp());
}

module.exports = { getFirestoreProyectos };
