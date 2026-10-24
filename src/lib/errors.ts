import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return Response.json(
      { error: "INVALID_INPUT", message: "Controlla i campi indicati e riprova.", details: error.issues },
      { status: 422 }
    );
  }
  if (error instanceof AppError) {
    return Response.json({ error: error.code, message: error.message }, { status: error.status });
  }
  console.error("Errore applicativo non gestito", error);
  return Response.json(
    { error: "INTERNAL_ERROR", message: "Si e verificato un errore. Riprova o contatta l'amministratore." },
    { status: 500 }
  );
}
