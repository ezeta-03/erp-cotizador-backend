-- CreateTable: log de cambios de estado en cotizaciones
-- Registra quién cambió qué estado, cuándo y con qué comentario

CREATE TABLE "CotizacionLog" (
  "id"             SERIAL PRIMARY KEY,
  "cotizacionId"   INTEGER NOT NULL,
  "usuarioId"      INTEGER NOT NULL,
  "estadoAnterior" "EstadoCotizacion",
  "estadoNuevo"    "EstadoCotizacion" NOT NULL,
  "comentario"     TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "CotizacionLog_cotizacionId_idx" ON "CotizacionLog"("cotizacionId");

ALTER TABLE "CotizacionLog"
  ADD CONSTRAINT "CotizacionLog_cotizacionId_fkey"
  FOREIGN KEY ("cotizacionId") REFERENCES "Cotizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CotizacionLog"
  ADD CONSTRAINT "CotizacionLog_usuarioId_fkey"
  FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
