import { createHash, randomUUID } from "node:crypto";
import { Prisma, Role, WorkStatus } from "@prisma/client";
import { z } from "zod";
import type { SessionContext } from "./auth";
import { assertRole } from "./auth";
import { appendAudit } from "./audit";
import { db } from "./db";
import { AppError } from "./errors";

export const MAX_CHART_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_CHART_ROWS = 5000;

type CsvUpload = {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export type ChartDraftLine = {
  code: string;
  name: string;
  accountType: string | null;
  parentCode: string | null;
  position: number;
};

const lineSchema = z.object({
  code: z.string().trim().min(1).max(40).regex(/^[^\u0000-\u001F\u007F]+$/),
  name: z.string().trim().min(1).max(200).regex(/^[^\u0000-\u001F\u007F]+$/),
  accountType: z.string().trim().max(80).nullable(),
  parentCode: z.string().trim().max(40).nullable(),
  position: z.number().int().positive()
}).strict();

function detectSeparator(source: string) {
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\"") {
      if (quoted && source[index + 1] === "\"") index += 1;
      else quoted = !quoted;
    } else if (!quoted && (character === "\n" || character === "\r")) {
      break;
    } else if (!quoted && character === ",") commas += 1;
    else if (!quoted && character === ";") semicolons += 1;
  }
  if (commas === 0 && semicolons === 0) {
    throw new AppError("INVALID_CSV", "L'intestazione CSV deve usare virgole o punti e virgola.", 422);
  }
  return semicolons > commas ? ";" : ",";
}

function parseRows(source: string, separator: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const pushRow = () => {
    row.push(field);
    field = "";
    if (row.some((value) => value.trim() !== "")) rows.push(row);
    row = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === "\"" && source[index + 1] === "\"") {
        field += "\"";
        index += 1;
      } else if (character === "\"") {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === "\"") {
      if (field.length > 0) throw new AppError("INVALID_CSV", "Virgolette non valide nel file CSV.", 422);
      quoted = true;
    } else if (character === separator) {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      pushRow();
    } else if (character === "\r") {
      if (source[index + 1] !== "\n") pushRow();
    } else {
      field += character;
    }
  }
  if (quoted) throw new AppError("INVALID_CSV", "Una cella CSV contiene virgolette non chiuse.", 422);
  if (field.length > 0 || row.length > 0) pushRow();
  return rows;
}

function normalizedHeader(value: string) {
  return value.trim().toLocaleLowerCase("it").replaceAll(" ", "_");
}

function assertValidHierarchy(lines: ChartDraftLine[]) {
  const codes = new Set(lines.map((line) => line.code));
  const parents = new Map(lines.map((line) => [line.code, line.parentCode]));
  for (const line of lines) {
    if (line.parentCode && !codes.has(line.parentCode)) {
      throw new AppError("UNKNOWN_PARENT", "Il conto " + line.code + " indica un codice padre non presente nel file.", 422);
    }
    if (line.parentCode === line.code) {
      throw new AppError("CYCLIC_HIERARCHY", "Il conto " + line.code + " non puo essere padre di se stesso.", 422);
    }
  }
  const visited = new Set<string>();
  const active = new Set<string>();
  const visit = (code: string) => {
    if (active.has(code)) throw new AppError("CYCLIC_HIERARCHY", "La gerarchia del piano dei conti contiene un ciclo.", 422);
    if (visited.has(code)) return;
    active.add(code);
    const parent = parents.get(code);
    if (parent) visit(parent);
    active.delete(code);
    visited.add(code);
  };
  for (const line of lines) visit(line.code);
}

export async function parseChartCsv(file: CsvUpload) {
  if (!file.name.toLocaleLowerCase("it").endsWith(".csv")) {
    throw new AppError("INVALID_FILE_TYPE", "Seleziona un file con estensione .csv.", 422);
  }
  const allowedTypes = new Set(["", "text/csv", "text/plain", "application/vnd.ms-excel"]);
  if (!allowedTypes.has(file.type.toLocaleLowerCase("it"))) {
    throw new AppError("INVALID_FILE_TYPE", "Il tipo del file non e compatibile con CSV.", 422);
  }
  if (file.size < 1 || file.size > MAX_CHART_FILE_BYTES) {
    throw new AppError("INVALID_FILE_SIZE", "Il file CSV deve avere una dimensione compresa tra 1 byte e 2 MiB.", 413);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileHash = createHash("sha256").update(bytes).digest("hex");
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    throw new AppError("INVALID_ENCODING", "Il file deve essere codificato in UTF-8.", 422);
  }
  if (source.includes("\u0000")) throw new AppError("INVALID_CSV", "Il file CSV contiene caratteri non validi.", 422);

  const rows = parseRows(source, detectSeparator(source));
  if (rows.length < 2) throw new AppError("EMPTY_CSV", "Il file deve contenere un'intestazione e almeno un conto.", 422);
  if (rows.length - 1 > MAX_CHART_ROWS) {
    throw new AppError("TOO_MANY_ROWS", "Il file supera il limite di " + MAX_CHART_ROWS + " conti.", 422);
  }

  const headers = rows[0].map(normalizedHeader);
  const allowedHeaders = new Set(["codice", "nome", "tipo", "codice_padre"]);
  if (headers.some((header) => !allowedHeaders.has(header)) || new Set(headers).size !== headers.length) {
    throw new AppError("INVALID_HEADERS", "Le colonne ammesse sono: codice, nome, tipo, codice_padre.", 422);
  }
  const codeIndex = headers.indexOf("codice");
  const nameIndex = headers.indexOf("nome");
  if (codeIndex < 0 || nameIndex < 0) {
    throw new AppError("INVALID_HEADERS", "Le colonne codice e nome sono obbligatorie.", 422);
  }
  const typeIndex = headers.indexOf("tipo");
  const parentIndex = headers.indexOf("codice_padre");
  const seen = new Set<string>();
  const lines = rows.slice(1).map((values, index) => {
    if (values.length !== headers.length) {
      throw new AppError("INVALID_CSV", "La riga " + (index + 2) + " non ha lo stesso numero di colonne dell'intestazione.", 422);
    }
    const code = values[codeIndex].trim();
    if (seen.has(code)) throw new AppError("DUPLICATE_ACCOUNT_CODE", "Il codice " + code + " compare piu volte.", 422);
    seen.add(code);
    return lineSchema.parse({
      code,
      name: values[nameIndex],
      accountType: typeIndex >= 0 ? values[typeIndex].trim() || null : null,
      parentCode: parentIndex >= 0 ? values[parentIndex].trim() || null : null,
      position: index + 1
    });
  });
  assertValidHierarchy(lines);
  return { fileHash, lines };
}

export async function createChartImportDraft(
  context: SessionContext,
  file: CsvUpload,
  ipAddress?: string | null
) {
  assertRole(context, [Role.OPERATOR, Role.ADMIN]);
  const parsed = await parseChartCsv(file);
  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.chartImport.findUnique({
        where: { companyId_fileHash: { companyId: context.companyId, fileHash: parsed.fileHash } },
        select: { id: true }
      });
      if (existing) throw new AppError("DUPLICATE_FILE", "Questo file e gia stato importato per l'azienda selezionata.", 409);
      const chartImport = await tx.chartImport.create({
        data: {
          companyId: context.companyId,
          sourceFileName: file.name.slice(0, 255),
          fileHash: parsed.fileHash,
          rowCount: parsed.lines.length,
          status: WorkStatus.DRAFT,
          createdById: context.userId,
          lines: { create: parsed.lines }
        },
        include: { lines: { orderBy: { position: "asc" }, take: 100 } }
      });
      await appendAudit(tx, {
        companyId: context.companyId,
        actorId: context.userId,
        eventType: "CHART_IMPORT_DRAFT_CREATED",
        entityType: "ChartImport",
        entityId: chartImport.id,
        afterValue: {
          sourceFileName: chartImport.sourceFileName,
          fileHash: chartImport.fileHash,
          rowCount: chartImport.rowCount,
          status: chartImport.status,
          version: chartImport.version
        } satisfies Prisma.InputJsonValue,
        ipAddress,
        correlationId: randomUUID()
      });
      return chartImport;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("DUPLICATE_FILE", "Questo file e gia stato importato per l'azienda selezionata.", 409);
    }
    throw error;
  }
}
