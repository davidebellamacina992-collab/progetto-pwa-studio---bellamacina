import { redirect } from "next/navigation";
import { requireSession } from "./auth";
import { AppError } from "./errors";

export async function requirePageSession() {
  try {
    return await requireSession();
  } catch (error) {
    if (error instanceof AppError && (error.status === 401 || error.code === "NO_COMPANY_ACCESS")) redirect("/login");
    throw error;
  }
}
