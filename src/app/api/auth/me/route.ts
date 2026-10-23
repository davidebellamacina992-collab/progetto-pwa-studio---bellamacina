import { requireSession } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";

export async function GET() {
  try {
    const context = await requireSession();
    return Response.json(context);
  } catch (error) {
    return errorResponse(error);
  }
}
