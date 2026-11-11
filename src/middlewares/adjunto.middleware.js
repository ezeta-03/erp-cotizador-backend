const multer = require("multer");
const { TAMANO_MAXIMO, MAXIMO_ARCHIVOS } = require("../services/almacenamiento.service");

// Recibe uno o varios archivos opcionales en el campo "archivo" (multipart) y
// los deja en req.files; responde 400 con un mensaje claro si alguno es muy
// grande o son demasiados. Sin multipart, deja pasar el JSON.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: TAMANO_MAXIMO, files: MAXIMO_ARCHIVOS } });

const MENSAJES = {
  LIMIT_FILE_SIZE: "Algún archivo supera los 5 MB",
  LIMIT_FILE_COUNT: `Adjunta como máximo ${MAXIMO_ARCHIVOS} archivos a la vez`,
  LIMIT_UNEXPECTED_FILE: `Adjunta como máximo ${MAXIMO_ARCHIVOS} archivos a la vez`,
};

module.exports = (req, res, next) =>
  upload.array("archivo", MAXIMO_ARCHIVOS)(req, res, (err) => {
    if (!err) return next();
    res.status(400).json({ message: MENSAJES[err.code] || err.message });
  });
