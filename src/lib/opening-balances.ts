import { createHash, randomUUID } from "node:crypto";
import { Prisma, Role, WorkStatus } from "@prisma/client";
import type { SessionContext } from "./auth";
import { assertRole } from "./auth";
import { appendAudit } from "./audit";
import { db } from "./db";
import { AppError } from "./errors";

export const MAX_OPENING_BALANCE_BYTES = 2 * 1024 * 1024;
export const MAX_OPENING_BALANCE_ROWS = 5000;

type CsvUpload = { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };
export type OpeningBalanceLine = { accountCode: string; description: string; debitCents: bigint; creditCents: bigint };

function moneyToCents(value: string, rowNumber: number) {
  const normalized = value.trim().replaceAll(" ", "").replace(",", ".");
  if (!normalized) return 0n;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new AppError("INVALID_AMOUNT", `Importo non valido alla riga ${rowNumber}. Usa al massimo due decimali e nessun segno.`, 422);
  }
  const [units, decimals = ""] = normalized.split(".");
  return BigInt(units) * 100n + BigInt(decimals.padEnd(2, "0"));
}

function parseCsvRows(source: string, separator: string) {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  const push = () => { row.push(field); if (row.some((item) => item.trim())) rows.push(row); row = []; field = ""; };
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') {
      if (field) throw new AppError("INVALID_CSV", "Virgolette non valide nel CSV.", 422);
      quoted = true;
    } else if (char === separator) { row.push(field); field = ""; }
    else if (char === "\n") push();
    else if (char === "\r") { if (source[index + 1] !== "\n") push(); }
    else field += char;
  }
  if (quoted) throw new AppError("INVALID_CSV", "Virgolette non chiuse nel CSV.", 422);
  if (field || row.length) push();
  return rows;
}

export async function parseOpeningBalancesCsv(file: CsvUpload) {
  if (!file.name.toLowerCase().endsWith(".csv")) throw new AppError("INVALID_FILE_TYPE", "Seleziona un file .csv.", 422);
  if (!["", "text/csv", "text/plain", "application/vnd.ms-excel"].includes(file.type.toLowerCase())) {
    throw new AppError("INVALID_FILE_TYPE", "Il tipo del file non e compatibile con CSV.", 422);
  }
  if (file.size < 1 || file.size > MAX_OPENING_BALANCE_BYTES) throw new AppError("INVALID_FILE_SIZE", "Il file deve essere compreso tra 1 byte e 2 MiB.", 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileHash = createHash("sha256").update(bytes).digest("hex");
  let source: string;
  try { source = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, ""); }
  catch { throw new AppError("INVALID_ENCODING", "Il file deve essere UTF-8.", 422); }
  const firstLine = source.split(/\r?\n/, 1)[0];
  const separator = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows = parseCsvRows(source, separator);
  if (rows.length < 2) throw new AppError("EMPTY_CSV", "Inserisci intestazione e almeno una riga.", 422);
  if (rows.length - 1 > MAX_OPENING_BALANCE_ROWS) throw new AppError("TOO_MANY_ROWS", "Il file supera 5.000 righe.", 422);
  const headers = rows[0].map((value) => value.trim().toLowerCase());
  if (headers.join("|") !== "codice|descrizione|dare|avere") {
    throw new AppError("INVALID_HEADERS", "Le colonne devono essere: codice, descrizione, dare, avere.", 422);
  }
  const seen = new Set<string>();
  let totalDebit = 0n, totalCredit = 0n;
  const lines = rows.slice(1).map((values, index): OpeningBalanceLine => {
    const rowNumber = index + 2;
    if (values.length !== 4) throw new AppError("INVALID_CSV", `La riga ${rowNumber} deve avere quattro colonne.`, 422);
    const accountCode = values[0].trim();
    if (!accountCode || accountCode.length > 40) throw new AppError("INVALID_ACCOUNT", `Codice conto non valido alla riga ${rowNumber}.`, 422);
    if (seen.has(accountCode)) throw new AppError("DUPLICATE_ACCOUNT", `Il conto ${accountCode} compare piu volte.`, 422);
    seen.add(accountCode);
    const debitCents = moneyToCents(values[2], rowNumber);
    const creditCents = moneyToCents(values[3], rowNumber);
    if ((debitCents === 0n) === (creditCents === 0n)) throw new AppError("INVALID_SIDES", `La riga ${rowNumber} deve valorizzare solo Dare oppure Avere.`, 422);
    totalDebit += debitCents; totalCredit += creditCents;
    return { accountCode, description: values[1].trim() || "Saldo iniziale", debitCents, creditCents };
  });
  if (totalDebit === 0n || totalDebit !== totalCredit) throw new AppError("UNBALANCED_ENTRY", "I saldi iniziali devono avere totale Dare uguale al totale Avere.", 422);
  return { fileHash, lines, totalDebitCents: totalDebit };
}

export async function createOpeningBalanceDraft(context: SessionContext, chartImportId: string, file: CsvUpload, ipAddress?: string | null) {
  assertRole(context, [Role.OPERATOR, Role.ADMIN]);
  const parsed = await parseOpeningBalancesCsv(file);
  try {
    return await db.$transaction(async (tx) => {
      const chart = await tx.chartImport.findFirst({
        where: { id: chartImportId, companyId: context.companyId, status: WorkStatus.FINALIZED },
        include: { lines: { select: { code: true } } }
      });
      if (!chart) throw new AppError("FINALIZED_CHART_REQUIRED", "Seleziona un piano dei conti finalizzato della stessa azienda.", 422);
      const allowedCodes = new Set(chart.lines.map((line) => line.code));
      const unknown = parsed.lines.find((line) => !allowedCodes.has(line.accountCode));
      if (unknown) throw new AppError("UNKNOWN_ACCOUNT", `Il conto ${unknown.accountCode} non appartiene al piano selezionato.`, 422);
      const draft = await tx.accountingDraft.create({
        data: {
          companyId: context.companyId, createdById: context.userId,
          description: `Saldi iniziali · ${file.name.slice(0, 220)}`,
          sourceType: "OPENING_BALANCE_CSV", sourceFileName: file.name.slice(0, 255),
          sourceFileHash: parsed.fileHash, sourceChartImportId: chart.id,
          lines: { create: parsed.lines }
        }, include: { lines: true }
      });
      await appendAudit(tx, {
        companyId: context.companyId, actorId: context.userId, eventType: "OPENING_BALANCES_DRAFT_CREATED",
        entityType: "AccountingDraft", entityId: draft.id,
        afterValue: { status: "DRAFT", fileHash: parsed.fileHash, chartImportId: chart.id, rowCount: parsed.lines.length, totalDebitCents: parsed.totalDebitCents.toString() } satisfies Prisma.InputJsonValue,
        ipAddress, correlationId: randomUUID()
      });
      return draft;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new AppError("DUPLICATE_FILE", "Questo file e gia stato importato per l'azienda.", 409);
    throw error;
  }
}
