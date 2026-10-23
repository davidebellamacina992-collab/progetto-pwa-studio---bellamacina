import { revokeSession } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/security";

export async function POST() {
  try {
    await assertSameOrigin();
    await revokeSession();
    return Response.json({ message: "Sessione terminata." });
  } catch (error) {
    return errorResponse(error);
  }
}
