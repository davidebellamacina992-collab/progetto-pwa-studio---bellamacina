import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma, Role, WorkStatus } from "@prisma/client";
import type { SessionContext } from "./auth";
import { assertRole } from "./auth";
import { appendAudit } from "./audit";
import { db } from "./db";
import { AppError } from "./errors";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

type XmlUpload = { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };

export type FatturaPaExtraction = {
  supplierName: string | null;
  supplierVatNumber: string | null;
  customerVatNumber: string | null;
  documentNumber: string | null;
  issueDate: Date | null;
  currencyCode: string;
  taxableCents: bigint | null;
  vatCents: bigint | null;
  totalCents: bigint | null;
  dueDate: Date | null;
  confidencePermille: number;
  sourceReferences: Record<string, string>;
  warnings: Array<{ severity: "ATTENZIONE" | "INFO"; message: string }>;
};

function decodeXmlText(value: string) {
  const decoded = value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .trim();
  if (/&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]+);/i.test(decoded)) {
    throw new AppError("UNSUPPORTED_XML_ENTITY", "Il file XML contiene entita non supportate.", 422);
  }
  return decoded;
}

function tagPattern(tag: string, global = false) {
  return new RegExp(`<(?:(?:[A-Za-z_][\\w.-]*):)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:(?:[A-Za-z_][\\w.-]*):)?${tag}\\s*>`, global ? "gi" : "i");
}

function firstTag(xml: string, tag: string) {
  const match = tagPattern(tag).exec(xml);
  return match ? decodeXmlText(match[1].replace(/<[^>]+>/g, "")) || null : null;
}

function firstBlock(xml: string, tag: string) {
  return tagPattern(tag).exec(xml)?.[1] ?? null;
}

function allBlocks(xml: string, tag: string) {
  return [...xml.matchAll(tagPattern(tag, true))].map((match) => match[1]);
}

export function decimalToCents(value: string, fieldName: string) {
  const normalized = value.trim().replace(",", ".");
  const match = /^(\d{1,15})(?:\.(\d{1,8}))?$/.exec(normalized);
  if (!match) throw new AppError("INVALID_AMOUNT", `${fieldName} non contiene un importo valido.`, 422);
  const decimals = match[2] ?? "";
  if (decimals.length > 2 && /[^0]/.test(decimals.slice(2))) {
    throw new AppError("UNSUPPORTED_AMOUNT_PRECISION", `${fieldName} usa piu di due decimali significativi.`, 422);
  }
  return BigInt(match[1]) * 100n + BigInt((decimals + "00").slice(0, 2));
}

function parseDate(value: string | null, fieldName: string) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new AppError("INVALID_DATE", `${fieldName} non contiene una data valida.`, 422);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new AppError("INVALID_DATE", `${fieldName} non contiene una data valida.`, 422);
  }
  return date;
}

function vatNumber(block: string | null) {
  if (!block) return null;
  const fiscal = firstBlock(block, "IdFiscaleIVA");
  if (!fiscal) return null;
  const country = firstTag(fiscal, "IdPaese")?.toUpperCase() ?? "";
  const code = firstTag(fiscal, "IdCodice")?.toUpperCase() ?? "";
  return country && code ? `${country}${code}`.slice(0, 20) : null;
}

export function parseFatturaPaXml(source: string): FatturaPaExtraction {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) {
    throw new AppError("UNSAFE_XML", "Il file XML contiene dichiarazioni DTD o entita non consentite.", 422);
  }
  if (!/<(?:(?:[A-Za-z_][\w.-]*):)?FatturaElettronica(?:\s|>)/i.test(source)) {
    throw new AppError("NOT_FATTURAPA", "Il file non contiene una FatturaPA riconoscibile.", 422);
  }
  const supplier = firstBlock(source, "CedentePrestatore");
  const customer = firstBlock(source, "CessionarioCommittente");
  const general = firstBlock(source, "DatiGeneraliDocumento") ?? "";
  const supplierName = firstTag(supplier ?? "", "Denominazione")
    ?? ([firstTag(supplier ?? "", "Nome"), firstTag(supplier ?? "", "Cognome")].filter(Boolean).join(" ") || null);
  const summaries = allBlocks(source, "DatiRiepilogo");
  const taxableValues = summaries.map((block) => firstTag(block, "ImponibileImporto")).filter((value): value is string => Boolean(value));
  const vatValues = summaries.map((block) => firstTag(block, "Imposta")).filter((value): value is string => Boolean(value));
  const taxableCents = taxableValues.length ? taxableValues.reduce((sum, value) => sum + decimalToCents(value, "ImponibileImporto"), 0n) : null;
  const vatCents = vatValues.length ? vatValues.reduce((sum, value) => sum + decimalToCents(value, "Imposta"), 0n) : null;
  const totalText = firstTag(general, "ImportoTotaleDocumento");
  const totalCents = totalText ? decimalToCents(totalText, "ImportoTotaleDocumento") : taxableCents !== null && vatCents !== null ? taxableCents + vatCents : null;
  const warnings: FatturaPaExtraction["warnings"] = [];
  if (totalCents !== null && taxableCents !== null && vatCents !== null && totalCents !== taxableCents + vatCents) {
    warnings.push({ severity: "ATTENZIONE", message: "Il totale documento non coincide con imponibile piu IVA; verifica ritenute, bolli o arrotondamenti." });
  }
  if (!supplier) warnings.push({ severity: "ATTENZIONE", message: "Cedente/prestatore non trovato nel file." });
  if (!customer) warnings.push({ severity: "ATTENZIONE", message: "Cessionario/committente non trovato nel file." });
  const payment = allBlocks(source, "DettaglioPagamento")[0] ?? "";
  const currencyCode = (firstTag(general, "Divisa") ?? "EUR").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) throw new AppError("INVALID_CURRENCY", "La divisa della fattura non e valida.", 422);
  const values = [vatNumber(supplier), vatNumber(customer), firstTag(general, "Numero"), firstTag(general, "Data"), taxableCents, vatCents, totalCents, currencyCode];
  const present = values.filter((value) => value !== null && value !== "").length;
  return {
    supplierName: supplierName?.slice(0, 200) ?? null,
    supplierVatNumber: vatNumber(supplier),
    customerVatNumber: vatNumber(customer),
    documentNumber: firstTag(general, "Numero")?.slice(0, 50) ?? null,
    issueDate: parseDate(firstTag(general, "Data"), "Data documento"),
    currencyCode,
    taxableCents,
    vatCents,
    totalCents,
    dueDate: parseDate(firstTag(payment, "DataScadenzaPagamento"), "Data scadenza"),
    confidencePermille: Math.floor((present * 1000) / values.length),
    sourceReferences: {
      supplierName: "CedentePrestatore/Anagrafica",
      supplierVatNumber: "CedentePrestatore/DatiAnagrafici/IdFiscaleIVA",
      customerVatNumber: "CessionarioCommittente/DatiAnagrafici/IdFiscaleIVA",
      documentNumber: "DatiGeneraliDocumento/Numero",
      issueDate: "DatiGeneraliDocumento/Data",
      taxableCents: "DatiRiepilogo/ImponibileImporto",
      vatCents: "DatiRiepilogo/Imposta",
      totalCents: totalText ? "DatiGeneraliDocumento/ImportoTotaleDocumento" : "DatiRiepilogo"
    },
    warnings
  };
}

export async function parseFatturaPaFile(file: XmlUpload) {
  if (!file.name.toLowerCase().endsWith(".xml")) throw new AppError("INVALID_FILE_TYPE", "Seleziona un file XML FatturaPA.", 422);
  if (!["", "application/xml", "text/xml", "application/octet-stream"].includes(file.type.toLowerCase())) throw new AppError("INVALID_FILE_TYPE", "Il tipo del file non e compatibile con XML.", 422);
  if (file.size < 1 || file.size > MAX_DOCUMENT_BYTES) throw new AppError("INVALID_FILE_SIZE", "Il file deve avere una dimensione compresa tra 1 byte e 10 MiB.", 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    throw new AppError("INVALID_ENCODING", "Il file XML deve essere codificato in UTF-8.", 422);
  }
  return { bytes, fileHash: createHash("sha256").update(bytes).digest("hex"), extraction: parseFatturaPaXml(source) };
}

export async function createFatturaPaDocumentDraft(context: SessionContext, file: XmlUpload, ipAddress?: string | null) {
  assertRole(context, [Role.OPERATOR, Role.ADMIN]);
  const parsed = await parseFatturaPaFile(file);
  const storageRoot = path.resolve(process.env.DOCUMENT_STORAGE_DIR ?? path.join(process.cwd(), "work", "document-storage"));
  const storageKey = `${context.companyId}/${parsed.fileHash}.xml`;
  const target = path.resolve(storageRoot, storageKey);
  if (!target.startsWith(storageRoot + path.sep)) throw new AppError("INVALID_STORAGE_PATH", "Percorso di archiviazione non valido.", 500);
  await mkdir(path.dirname(target), { recursive: true });
  let storedNow = false;
  try {
    await writeFile(target, parsed.bytes, { flag: "wx" });
    storedNow = true;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
  }
  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.accountingDocument.findUnique({
        where: { companyId_fileHash: { companyId: context.companyId, fileHash: parsed.fileHash } },
        select: { id: true }
      });
      if (existing) throw new AppError("DUPLICATE_FILE", "Questo documento e gia stato caricato per l'azienda selezionata.", 409);
      const extraction = parsed.extraction;
      const document = await tx.accountingDocument.create({
        data: {
          companyId: context.companyId,
          kind: "FATTURA_PA_XML",
          sourceFileName: file.name.slice(0, 255),
          mediaType: file.type || "application/xml",
          fileHash: parsed.fileHash,
          byteSize: file.size,
          storageKey,
          status: WorkStatus.DRAFT,
          createdById: context.userId,
          extraction: { create: {
            supplierName: extraction.supplierName,
            supplierVatNumber: extraction.supplierVatNumber,
            customerVatNumber: extraction.customerVatNumber,
            documentNumber: extraction.documentNumber,
            issueDate: extraction.issueDate,
            currencyCode: extraction.currencyCode,
            taxableCents: extraction.taxableCents,
            vatCents: extraction.vatCents,
            totalCents: extraction.totalCents,
            dueDate: extraction.dueDate,
            confidencePermille: extraction.confidencePermille,
            sourceReferences: extraction.sourceReferences,
            warnings: extraction.warnings
          } }
        },
        include: { extraction: true }
      });
      await appendAudit(tx, {
        companyId: context.companyId,
        actorId: context.userId,
        eventType: "ACCOUNTING_DOCUMENT_DRAFT_CREATED",
        entityType: "AccountingDocument",
        entityId: document.id,
        afterValue: {
          kind: document.kind,
          sourceFileName: document.sourceFileName,
          fileHash: document.fileHash,
          byteSize: document.byteSize,
          status: document.status,
          confidencePermille: extraction.confidencePermille,
          warningCount: extraction.warnings.length
        } satisfies Prisma.InputJsonValue,
        ipAddress,
        correlationId: randomUUID()
      });
      return document;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (storedNow) await rm(target, { force: true }).catch(() => undefined);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("DUPLICATE_FILE", "Questo documento e gia stato caricato per l'azienda selezionata.", 409);
    }
    throw error;
  }
}
