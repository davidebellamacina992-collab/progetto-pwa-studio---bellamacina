import { describe, expect, it } from "vitest";
import { decimalToCents, parseFatturaPaFile, parseFatturaPaXml } from "@/lib/fatturapa-document";

const invoice = `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica xmlns:p="urn:test" versione="FPR12">
  <p:CedentePrestatore><p:DatiAnagrafici><p:IdFiscaleIVA><p:IdPaese>IT</p:IdPaese><p:IdCodice>00000000011</p:IdCodice></p:IdFiscaleIVA><p:Anagrafica><p:Denominazione>Fornitore Fittizio S.r.l.</p:Denominazione></p:Anagrafica></p:DatiAnagrafici></p:CedentePrestatore>
  <p:CessionarioCommittente><p:DatiAnagrafici><p:IdFiscaleIVA><p:IdPaese>IT</p:IdPaese><p:IdCodice>00000000022</p:IdCodice></p:IdFiscaleIVA></p:DatiAnagrafici></p:CessionarioCommittente>
  <p:DatiGeneraliDocumento><p:Divisa>EUR</p:Divisa><p:Data>2026-10-29</p:Data><p:Numero>FT-TEST-1</p:Numero><p:ImportoTotaleDocumento>183,00</p:ImportoTotaleDocumento></p:DatiGeneraliDocumento>
  <p:DatiRiepilogo><p:ImponibileImporto>100.00</p:ImponibileImporto><p:Imposta>22.00</p:Imposta></p:DatiRiepilogo>
  <p:DatiRiepilogo><p:ImponibileImporto>50.00</p:ImponibileImporto><p:Imposta>11.00</p:Imposta></p:DatiRiepilogo>
  <p:DettaglioPagamento><p:DataScadenzaPagamento>2026-11-30</p:DataScadenzaPagamento></p:DettaglioPagamento>
</p:FatturaElettronica>`;

describe("estrazione FatturaPA", () => {
  it("estrae identificativi, date e importi esatti in centesimi", () => {
    const result = parseFatturaPaXml(invoice);
    expect(result.supplierName).toBe("Fornitore Fittizio S.r.l.");
    expect(result.supplierVatNumber).toBe("IT00000000011");
    expect(result.customerVatNumber).toBe("IT00000000022");
    expect(result.documentNumber).toBe("FT-TEST-1");
    expect(result.issueDate?.toISOString().slice(0, 10)).toBe("2026-10-29");
    expect(result.taxableCents).toBe(15000n);
    expect(result.vatCents).toBe(3300n);
    expect(result.totalCents).toBe(18300n);
    expect(result.warnings).toHaveLength(0);
  });

  it("non usa float e accetta soltanto decimali rappresentabili esattamente", () => {
    expect(decimalToCents("123456789012345.67", "Totale")).toBe(12345678901234567n);
    expect(decimalToCents("10.1200", "Totale")).toBe(1012n);
    expect(() => decimalToCents("10.125", "Totale")).toThrow(/due decimali/i);
  });

  it("segnala una quadratura differente senza correggere il documento", () => {
    const result = parseFatturaPaXml(invoice.replace("183,00", "184,00"));
    expect(result.totalCents).toBe(18400n);
    expect(result.warnings[0]?.message).toMatch(/non coincide/i);
  });

  it("rifiuta DTD ed entita XML esterne", () => {
    expect(() => parseFatturaPaXml(`<!DOCTYPE x [<!ENTITY ext SYSTEM "file:///etc/passwd">]>${invoice}`)).toThrow(/DTD|entita/i);
  });

  it("rifiuta file XML che non sono FatturaPA", () => {
    expect(() => parseFatturaPaXml("<documento><totale>10.00</totale></documento>")).toThrow(/FatturaPA/i);
  });

  it("accetta il MIME generico di Windows soltanto se il contenuto e FatturaPA", async () => {
    const bytes = new TextEncoder().encode(invoice);
    const result = await parseFatturaPaFile({
      name: "fattura-fittizia.xml",
      type: "application/octet-stream",
      size: bytes.byteLength,
      arrayBuffer: async () => bytes.buffer as ArrayBuffer
    });
    expect(result.extraction.documentNumber).toBe("FT-TEST-1");
    await expect(parseFatturaPaFile({
      name: "fattura-fittizia.xml",
      type: "application/pdf",
      size: bytes.byteLength,
      arrayBuffer: async () => bytes.buffer as ArrayBuffer
    })).rejects.toThrow(/tipo/i);
  });
});
