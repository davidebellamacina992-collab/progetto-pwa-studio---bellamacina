import { PrismaClient, Role } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Il seed dimostrativo non puo essere eseguito in produzione.");
  }
  const password = process.env.SEED_DEMO_PASSWORD ?? "CambiaSubito!2026";
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const company = await prisma.company.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    update: { approverTotpRequired: false },
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Azienda Dimostrativa S.r.l. — DATI DI ESEMPIO",
      fourEyesRequired: true,
      approverTotpRequired: false
    }
  });
  const demoUsers = [
    ["operatore@example.test", "Operatore Demo", Role.OPERATOR],
    ["supervisore1@example.test", "Supervisore Demo 1", Role.SUPERVISOR],
    ["supervisore2@example.test", "Supervisore Demo 2", Role.SUPERVISOR],
    ["commercialista@example.test", "Commercialista Demo", Role.ACCOUNTANT]
  ] as const;
  for (const [email, displayName, role] of demoUsers) {
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, displayName, passwordHash }
    });
    await prisma.membership.upsert({
      where: { userId_companyId: { userId: user.id, companyId: company.id } },
      update: { role },
      create: { userId: user.id, companyId: company.id, role }
    });
  }
  console.info("Creati esclusivamente utenti e azienda dimostrativi (*.test).");
}

main().finally(() => prisma.$disconnect());
