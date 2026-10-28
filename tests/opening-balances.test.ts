import { describe, expect, it } from "vitest";
import { parseOpeningBalancesCsv } from "@/lib/opening-balances";

function upload(source: string, name = "saldi-fittizi.csv") {
  const bytes = new TextEncoder().encode(source);
  return { name, type: "text/csv", size: bytes.byteLength, async arrayBuffer() { return bytes.buffer; } };
}

describe("import saldi iniziali", () => {
  it("converte importi decimali in centesimi senza float e verifica la quadratura", async () => {
    const result = await parseOpeningBalancesCsv(upload("codice;descrizione;dare;avere\n100;Cassa;1000,25;\n200;Patrimonio;;1000,25\n"));
    expect(result.lines[0].debitCents).toBe(100025n);
    expect(result.lines[1].creditCents).toBe(100025n);
    expect(result.totalDebitCents).toBe(100025n);
    expect(result.fileHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("blocca i file non quadrati", async () => {
    await expect(parseOpeningBalancesCsv(upload("codice;descrizione;dare;avere\n100;Cassa;10,00;\n200;Patrimonio;;9,99\n")))
      .rejects.toThrow(/Dare uguale/i);
  });

  it("blocca una riga che valorizza entrambi i lati", async () => {
    await expect(parseOpeningBalancesCsv(upload("codice;descrizione;dare;avere\n100;Errore;10,00;10,00\n")))
      .rejects.toThrow(/solo Dare oppure Avere/i);
  });

  it("blocca codici conto duplicati", async () => {
    await expect(parseOpeningBalancesCsv(upload("codice;descrizione;dare;avere\n100;Uno;10,00;\n100;Due;;10,00\n")))
      .rejects.toThrow(/compare piu volte/i);
  });
});
