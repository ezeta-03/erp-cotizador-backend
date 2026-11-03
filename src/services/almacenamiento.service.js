// Archivos adjuntos (constancias de cobros y pagos) en Supabase Storage, vía su
// API REST con la clave de servicio. El bucket es privado: los archivos se
// descargan con una URL firmada que caduca.
const crypto = require("crypto");

// Acepta la Project URL tal cual o con el sufijo de la API REST (/rest/v1).
const url = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
const clave = process.env.SUPABASE_SERVICE_KEY;
const bucket = process.env.SUPABASE_BUCKET_ADJUNTOS || "adjuntos";

const TIPOS_PERMITIDOS = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const TAMANO_MAXIMO = 5 * 1024 * 1024;
const EXTENSION = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

class ErrorAlmacenamiento extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.status = status;
  }
}

const configurado = () => !!(url && clave);

// Rol de una clave JWT antigua (anon | service_role); las nuevas (sb_secret_…) no son JWT.
function rolDeClave() {
  try {
    return JSON.parse(Buffer.from(clave.split(".")[1], "base64url").toString()).role || null;
  } catch {
    return null;
  }
}

async function llamar(ruta, opciones = {}) {
  if (!configurado()) throw new ErrorAlmacenamiento("El almacenamiento de archivos no está configurado (SUPABASE_URL / SUPABASE_SERVICE_KEY)", 503);
  // Las claves nuevas van solo en apikey; las JWT antiguas, también como Bearer.
  const auth = clave.startsWith("sb_") ? {} : { Authorization: `Bearer ${clave}` };
  const res = await fetch(`${url}/storage/v1${ruta}`, {
    ...opciones,
    headers: { ...auth, apikey: clave, ...opciones.headers },
  });
  if (!res.ok) {
    const cuerpo = await res.text().catch(() => "");
    const rol = rolDeClave();
    const pista = /row-level security/i.test(cuerpo) && rol && rol !== "service_role"
      ? ` (SUPABASE_SERVICE_KEY es la clave "${rol}"; usa la "service_role")`
      : "";
    throw new ErrorAlmacenamiento(`Supabase Storage respondió ${res.status}: ${cuerpo.slice(0, 200)}${pista}`, 502);
  }
  return res;
}

function validarArchivo(archivo) {
  if (!TIPOS_PERMITIDOS.includes(archivo.mimetype)) throw new ErrorAlmacenamiento("Solo se aceptan imágenes (JPG, PNG, WEBP) o PDF");
  if (archivo.size > TAMANO_MAXIMO) throw new ErrorAlmacenamiento("El archivo supera los 5 MB");
}

// Sube un archivo de multer (memoryStorage) bajo carpeta/ y devuelve los datos
// para crear el AdjuntoPago (sin las claves foráneas).
async function subir(carpeta, archivo) {
  validarArchivo(archivo);
  const hoy = new Date().toISOString().slice(0, 7);
  const ruta = `${carpeta}/${hoy}/${crypto.randomUUID()}.${EXTENSION[archivo.mimetype]}`;
  await llamar(`/object/${bucket}/${ruta}`, {
    method: "POST",
    headers: { "Content-Type": archivo.mimetype, "x-upsert": "false" },
    body: archivo.buffer,
  });
  return { ruta, nombre: String(archivo.originalname || "archivo").slice(0, 200), tipo: archivo.mimetype, tamano: archivo.size };
}

// Borra archivos del bucket; un fallo solo se registra (la fila ya no existe).
async function borrar(rutas) {
  if (!rutas.length || !configurado()) return;
  try {
    await llamar(`/object/${bucket}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: rutas }),
    });
  } catch (error) {
    console.error("⚠️ No se pudieron borrar adjuntos de Supabase Storage:", rutas, error.message);
  }
}

// URL firmada para ver/descargar un adjunto (válida 10 minutos).
async function urlFirmada(ruta, segundos = 600) {
  const res = await llamar(`/object/sign/${bucket}/${ruta}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: segundos }),
  });
  const { signedURL } = await res.json();
  return `${url}/storage/v1${signedURL}`;
}

module.exports = { subir, borrar, urlFirmada, configurado, ErrorAlmacenamiento, TAMANO_MAXIMO };
