import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppError, errorResponse } from "@/lib/errors";
import { createFatturaPaDocumentDraft, MAX_DOCUMENT_BYTES } from "@/lib/fatturapa-document";
import { assertSameOrigin, requestIp } from "@/lib/security";

export const runtime = "nodejs";

export async function GET() {
  try {
    const context = await requireSession();
    const items = await db.accountingDocument.findMany({
      where: { companyId: context.companyId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { extraction: true, approvals: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } } }
    });
    return Response.json({ items: items.map((item) => ({
      ...item,
      extraction: item.extraction ? {
        ...item.extraction,
        taxableCents: item.extraction.taxableCents?.toString() ?? null,
        vatCents: item.extraction.vatCents?.toString() ?? null,
        totalCents: item.extraction.totalCents?.toString() ?? null
      } : null,
      approvalId: item.approvals[0]?.id ?? null,
      approvals: undefined
    })) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_DOCUMENT_BYTES + 64 * 1024) throw new AppError("INVALID_FILE_SIZE", "La richiesta supera il limite consentito.", 413);
    const context = await requireSession();
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new AppError("FILE_REQUIRED", "Seleziona una fattura XML.", 422);
    const document = await createFatturaPaDocumentDraft(context, file, requestIp(request.headers));
    return Response.json({ id: document.id, status: document.status }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
