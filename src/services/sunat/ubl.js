// Generación del XML UBL 2.1 que exige SUNAT (factura, boleta y nota de crédito).
// El PSE solo firma y envía: este XML va SIN firma, con el bloque
// ext:ExtensionContent vacío donde el PSE inserta la firma digital.
//
// Catálogos SUNAT usados: 01 tipo de documento, 05 tributos, 06 doc. de
// identidad, 07 afectación IGV, 09 motivos de nota de crédito, 51 tipo de
// operación, 52 leyendas.
const numeroALetras = require("../../utils/numeroALetras");
const { IGV_RATE } = require("../../config/negocio");

const CODIGO_TIPO = { FACTURA: "01", BOLETA: "03", NOTA_CREDITO: "07", NOTA_DEBITO: "08" };

// Etiquetas UBL por tipo de documento: raíz, línea, cantidad y bloque de totales
// (la nota de débito usa RequestedMonetaryTotal en lugar de LegalMonetaryTotal).
const ESTRUCTURA = {
  FACTURA: { raiz: "Invoice", linea: "InvoiceLine", cantidad: "InvoicedQuantity", totales: "LegalMonetaryTotal" },
  BOLETA: { raiz: "Invoice", linea: "InvoiceLine", cantidad: "InvoicedQuantity", totales: "LegalMonetaryTotal" },
  NOTA_CREDITO: { raiz: "CreditNote", linea: "CreditNoteLine", cantidad: "CreditedQuantity", totales: "LegalMonetaryTotal" },
  NOTA_DEBITO: { raiz: "DebitNote", linea: "DebitNoteLine", cantidad: "DebitedQuantity", totales: "RequestedMonetaryTotal" },
};

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const m2 = (n) => Number(n).toFixed(2);
// Precios unitarios: SUNAT admite hasta 10 decimales; se recortan ceros.
const mPrecio = (n) => String(Number(Number(n).toFixed(6)));

function numeroDocumento(serie, correlativo) {
  return `${serie}-${String(correlativo).padStart(8, "0")}`;
}

function nombreArchivo(ruc, tipo, serie, correlativo) {
  return `${ruc}-${CODIGO_TIPO[tipo]}-${numeroDocumento(serie, correlativo)}`;
}

function fechaHoraLima(fecha) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(fecha);
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour === "24" ? "00" : p.hour}:${p.minute}:${p.second}` };
}

// El PSE usa cbc:ID como Id de ds:Signature, que es de tipo xs:ID: no puede
// empezar con dígito (SUNAT responde 0306 si se pone el RUC).
const ID_FIRMA = "SignatureSP";

const bloqueFirma = (emisor) => `
  <cac:Signature>
    <cbc:ID>${ID_FIRMA}</cbc:ID>
    <cac:SignatoryParty>
      <cac:PartyIdentification><cbc:ID>${esc(emisor.ruc)}</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${esc(emisor.razonSocial)}</cbc:Name></cac:PartyName>
    </cac:SignatoryParty>
    <cac:DigitalSignatureAttachment>
      <cac:ExternalReference><cbc:URI>#${ID_FIRMA}</cbc:URI></cac:ExternalReference>
    </cac:DigitalSignatureAttachment>
  </cac:Signature>`;

const bloqueEmisor = (emisor) => {
  const d = emisor.direccion;
  return `
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="6">${esc(emisor.ruc)}</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${esc(emisor.nombreComercial)}</cbc:Name></cac:PartyName>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(emisor.razonSocial)}</cbc:RegistrationName>
        <cac:RegistrationAddress>
          <cbc:ID>${esc(d.ubigeo)}</cbc:ID>
          <cbc:AddressTypeCode>${esc(d.codigoLocal)}</cbc:AddressTypeCode>
          <cbc:CitySubdivisionName>${esc(d.urbanizacion)}</cbc:CitySubdivisionName>
          <cbc:CityName>${esc(d.provincia)}</cbc:CityName>
          <cbc:CountrySubentity>${esc(d.departamento)}</cbc:CountrySubentity>
          <cbc:District>${esc(d.distrito)}</cbc:District>
          <cac:AddressLine><cbc:Line>${esc(d.linea)}</cbc:Line></cac:AddressLine>
          <cac:Country><cbc:IdentificationCode>PE</cbc:IdentificationCode></cac:Country>
        </cac:RegistrationAddress>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>`;
};

const bloqueCliente = (c) => `
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="${esc(c.clienteTipoDoc)}">${esc(c.clienteNumDoc)}</cbc:ID></cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(c.clienteNombre)}</cbc:RegistrationName>${c.clienteDireccion ? `
        <cac:RegistrationAddress>
          <cac:AddressLine><cbc:Line>${esc(c.clienteDireccion)}</cbc:Line></cac:AddressLine>
          <cac:Country><cbc:IdentificationCode>PE</cbc:IdentificationCode></cac:Country>
        </cac:RegistrationAddress>` : ""}
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>`;

const esquemaIgv = `<cac:TaxScheme><cbc:ID>1000</cbc:ID><cbc:Name>IGV</cbc:Name><cbc:TaxTypeCode>VAT</cbc:TaxTypeCode></cac:TaxScheme>`;

const bloqueTotales = (c) => {
  const tag = ESTRUCTURA[c.tipo].totales;
  return `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${c.moneda}">${m2(c.igv)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${c.moneda}">${m2(c.valorVenta)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${c.moneda}">${m2(c.igv)}</cbc:TaxAmount>
      <cac:TaxCategory>${esquemaIgv}</cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:${tag}>
    <cbc:LineExtensionAmount currencyID="${c.moneda}">${m2(c.valorVenta)}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="${c.moneda}">${m2(c.total)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${c.moneda}">${m2(c.total)}</cbc:PayableAmount>
  </cac:${tag}>`;
};

function bloqueLinea(item, moneda, tipo) {
  const { linea: tag, cantidad: tagCantidad } = ESTRUCTURA[tipo];
  const precioConIgv = item.valorUnitario * (1 + IGV_RATE);
  return `
  <cac:${tag}>
    <cbc:ID>${item.orden}</cbc:ID>
    <cbc:${tagCantidad} unitCode="${esc(item.unidad)}">${item.cantidad}</cbc:${tagCantidad}>
    <cbc:LineExtensionAmount currencyID="${moneda}">${m2(item.valorVenta)}</cbc:LineExtensionAmount>
    <cac:PricingReference>
      <cac:AlternativeConditionPrice>
        <cbc:PriceAmount currencyID="${moneda}">${mPrecio(precioConIgv)}</cbc:PriceAmount>
        <cbc:PriceTypeCode>01</cbc:PriceTypeCode>
      </cac:AlternativeConditionPrice>
    </cac:PricingReference>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${moneda}">${m2(item.igv)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${moneda}">${m2(item.valorVenta)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${moneda}">${m2(item.igv)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:Percent>${IGV_RATE * 100}</cbc:Percent>
          <cbc:TaxExemptionReasonCode>${esc(item.afectacionIgv)}</cbc:TaxExemptionReasonCode>
          ${esquemaIgv}
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item><cbc:Description>${esc(item.descripcion)}</cbc:Description></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="${moneda}">${mPrecio(item.valorUnitario)}</cbc:PriceAmount></cac:Price>
  </cac:${tag}>`;
}

const NS = `xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"`;

const cabecera = (id, fh) => `
  <ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent/></ext:UBLExtension></ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ID>${id}</cbc:ID>
  <cbc:IssueDate>${fh.fecha}</cbc:IssueDate>
  <cbc:IssueTime>${fh.hora}</cbc:IssueTime>`;

// comprobante: registro Comprobante con items (y referencia, si es nota de crédito/débito)
function generarXml(comprobante, emisor) {
  const c = comprobante;
  const id = numeroDocumento(c.serie, c.correlativo);
  const fh = fechaHoraLima(new Date(c.fechaEmision));
  const leyenda = `<cbc:Note languageLocaleID="1000">${esc(numeroALetras(c.total, c.moneda))}</cbc:Note>`;
  const lineas = c.items
    .slice()
    .sort((a, b) => a.orden - b.orden)
    .map((it) => bloqueLinea(it, c.moneda, c.tipo))
    .join("");

  if (c.tipo === "NOTA_CREDITO" || c.tipo === "NOTA_DEBITO") {
    const ref = c.referencia;
    const refId = numeroDocumento(ref.serie, ref.correlativo);
    const raiz = ESTRUCTURA[c.tipo].raiz;
    return `<?xml version="1.0" encoding="UTF-8"?>
<${raiz} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${raiz}-2" ${NS}>${cabecera(id, fh)}
  ${leyenda}
  <cbc:DocumentCurrencyCode>${c.moneda}</cbc:DocumentCurrencyCode>
  <cac:DiscrepancyResponse>
    <cbc:ReferenceID>${refId}</cbc:ReferenceID>
    <cbc:ResponseCode>${esc(c.motivoCodigo)}</cbc:ResponseCode>
    <cbc:Description>${esc(c.motivoDescripcion)}</cbc:Description>
  </cac:DiscrepancyResponse>
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${refId}</cbc:ID>
      <cbc:DocumentTypeCode>${CODIGO_TIPO[ref.tipo]}</cbc:DocumentTypeCode>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>${bloqueFirma(emisor)}${bloqueEmisor(emisor)}${bloqueCliente(c)}${bloqueTotales(c)}${lineas}
</${raiz}>
`;
  }

  // Detracción: tipo de operación 1001, leyenda 2006, cuenta del Banco de la
  // Nación (PaymentMeans) y bien/servicio, % y monto (PaymentTerms).
  const conDetraccion = !!c.detraccionMonto;
  const detraccion = conDetraccion ? `
  <cac:PaymentMeans>
    <cbc:ID>Detraccion</cbc:ID>
    <cbc:PaymentMeansCode>${esc(c.detraccionMedioPago || "001")}</cbc:PaymentMeansCode>
    <cac:PayeeFinancialAccount><cbc:ID>${esc(c.detraccionCuenta)}</cbc:ID></cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:PaymentTerms>
    <cbc:ID>Detraccion</cbc:ID>
    <cbc:PaymentMeansID>${esc(c.detraccionCodigo)}</cbc:PaymentMeansID>
    <cbc:PaymentPercent>${c.detraccionPorcentaje}</cbc:PaymentPercent>
    <cbc:Amount currencyID="PEN">${m2(c.detraccionMonto)}</cbc:Amount>
  </cac:PaymentTerms>` : "";

  // Forma de pago: obligatoria en facturas desde 2021. A crédito se informa el
  // monto neto pendiente (total − detracción) y cada cuota con su vencimiento.
  let formaPago = "";
  if (c.tipo === "FACTURA" && c.formaPago === "CREDITO") {
    const cuotas = c.cuotas || [];
    formaPago = `
  <cac:PaymentTerms>
    <cbc:ID>FormaPago</cbc:ID>
    <cbc:PaymentMeansID>Credito</cbc:PaymentMeansID>
    <cbc:Amount currencyID="${c.moneda}">${m2(cuotas.reduce((a, q) => a + q.monto, 0))}</cbc:Amount>
  </cac:PaymentTerms>${cuotas.map((q, i) => `
  <cac:PaymentTerms>
    <cbc:ID>FormaPago</cbc:ID>
    <cbc:PaymentMeansID>Cuota${String(i + 1).padStart(3, "0")}</cbc:PaymentMeansID>
    <cbc:Amount currencyID="${c.moneda}">${m2(q.monto)}</cbc:Amount>
    <cbc:PaymentDueDate>${q.fechaVencimiento}</cbc:PaymentDueDate>
  </cac:PaymentTerms>`).join("")}`;
  } else if (c.tipo === "FACTURA") {
    formaPago = `
  <cac:PaymentTerms>
    <cbc:ID>FormaPago</cbc:ID>
    <cbc:PaymentMeansID>Contado</cbc:PaymentMeansID>
  </cac:PaymentTerms>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" ${NS}>${cabecera(id, fh)}
  <cbc:InvoiceTypeCode listID="${conDetraccion ? "1001" : "0101"}">${CODIGO_TIPO[c.tipo]}</cbc:InvoiceTypeCode>
  ${leyenda}${conDetraccion ? `
  <cbc:Note languageLocaleID="2006">Operación sujeta a detracción</cbc:Note>` : ""}
  <cbc:DocumentCurrencyCode>${c.moneda}</cbc:DocumentCurrencyCode>${bloqueFirma(emisor)}${bloqueEmisor(emisor)}${bloqueCliente(c)}${detraccion}${formaPago}${bloqueTotales(c)}${lineas}
</Invoice>
`;
}

module.exports = { generarXml, nombreArchivo, numeroDocumento, CODIGO_TIPO };
