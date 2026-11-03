-- Caja y Bancos: cuentas de la empresa con saldo inicial a una fecha de corte
CREATE TABLE "CuentaFinanciera" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'BANCO',
    "banco" TEXT,
    "numero" TEXT,
    "cci" TEXT,
    "moneda" TEXT NOT NULL DEFAULT 'PEN',
    "saldoInicial" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fechaSaldoInicial" TIMESTAMP(3) NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuentaFinanciera_pkey" PRIMARY KEY ("id")
);

-- Cuenta de cada cobro, pago y cuota de panel pagada, con el monto en la moneda de la cuenta
ALTER TABLE "PagoComprobante" ADD COLUMN "cuentaFinancieraId" INTEGER;
ALTER TABLE "PagoComprobante" ADD COLUMN "montoCuenta" DOUBLE PRECISION;
ALTER TABLE "PagoComprobante" ADD COLUMN "tipoCambioCuenta" DOUBLE PRECISION;
ALTER TABLE "PagoComprobante" ADD CONSTRAINT "PagoComprobante_cuentaFinancieraId_fkey" FOREIGN KEY ("cuentaFinancieraId") REFERENCES "CuentaFinanciera"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "PagoComprobante_cuentaFinancieraId_idx" ON "PagoComprobante"("cuentaFinancieraId");

ALTER TABLE "PagoCuentaPorPagar" ADD COLUMN "cuentaFinancieraId" INTEGER;
ALTER TABLE "PagoCuentaPorPagar" ADD COLUMN "montoCuenta" DOUBLE PRECISION;
ALTER TABLE "PagoCuentaPorPagar" ADD COLUMN "tipoCambioCuenta" DOUBLE PRECISION;
ALTER TABLE "PagoCuentaPorPagar" ADD CONSTRAINT "PagoCuentaPorPagar_cuentaFinancieraId_fkey" FOREIGN KEY ("cuentaFinancieraId") REFERENCES "CuentaFinanciera"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "PagoCuentaPorPagar_cuentaFinancieraId_idx" ON "PagoCuentaPorPagar"("cuentaFinancieraId");

ALTER TABLE "ProveedorCuota" ADD COLUMN "cuentaFinancieraId" INTEGER;
ALTER TABLE "ProveedorCuota" ADD COLUMN "montoCuenta" DOUBLE PRECISION;
ALTER TABLE "ProveedorCuota" ADD COLUMN "tipoCambioCuenta" DOUBLE PRECISION;
ALTER TABLE "ProveedorCuota" ADD CONSTRAINT "ProveedorCuota_cuentaFinancieraId_fkey" FOREIGN KEY ("cuentaFinancieraId") REFERENCES "CuentaFinanciera"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ProveedorCuota_cuentaFinancieraId_idx" ON "ProveedorCuota"("cuentaFinancieraId");
