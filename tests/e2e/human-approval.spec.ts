import { expect, test } from "@playwright/test";

test("un endpoint protetto non consente approvazioni anonime", async ({ request }) => {
  const response = await request.post("/api/approvals/00000000-0000-4000-8000-000000000099/approve", {
    data: { confirmation: "APPROVO" },
    headers: { Origin: process.env.APP_BASE_URL ?? "http://localhost:3000" }
  });
  expect(response.status()).toBe(401);
});

test("la pagina ricorda sempre la validazione del commercialista", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("Le valutazioni fiscali e civilistiche rilevanti devono essere validate dal commercialista.")).toBeVisible();
});

test("la dashboard reindirizza un visitatore anonimo al login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("il modulo di accesso e idratato e invia le credenziali via API", async ({ page }) => {
  await page.route("**/api/auth/login", async (route) => {
    expect(route.request().method()).toBe("POST");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message: "Accesso simulato nel test." }) });
  });
  await page.goto("/login");
  await page.getByLabel("Email di lavoro").fill("utente@example.test");
  await page.getByLabel("Password").fill("PasswordFittizia!2026");
  const submitted = page.waitForRequest((request) => request.url().includes("/api/auth/login") && request.method() === "POST");
  await page.getByRole("button", { name: "Accedi in sicurezza" }).click();
  await submitted;
  expect(page.url()).not.toContain("password=");
});
