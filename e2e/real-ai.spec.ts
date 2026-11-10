import { expect, test, type Browser, type Page } from "@playwright/test";
import path from "node:path";

// Durchlauf mit der ECHTEN KI. Nur manuell:
//   AI_MOCK=0 npx next dev -p 3001   und dann
//   E2E_REAL_AI=1 E2E_BASE_URL=http://localhost:3001 npx playwright test e2e/real-ai.spec.ts
test.skip(!process.env.E2E_REAL_AI, "nur mit E2E_REAL_AI=1 (kostet ein paar Cent)");
test.setTimeout(300_000);

const RECEIPT = path.join(__dirname, "fixtures", "receipt-greek.jpg");
const PLATE = path.join(__dirname, "fixtures", "plate.jpg");
const SHOTS = process.env.E2E_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `real-${name}.png`) });
};

async function person(browser: Browser) {
  const context = await browser.newContext({ ...(test.info().project.use as object) });
  return context.newPage();
}

async function chat(page: Page, text: string) {
  await page.getByRole("button", { name: "Chat" }).click();
  await page.getByPlaceholder(/Was hattest du/).fill(text);
  await page.getByRole("button", { name: "Senden" }).click();
}

const money = (t: string) => Number(t.replace(/[^\d,-]/g, "").replace(",", "."));

test("echte KI: ein Abend in der Taverne", async ({ browser }) => {
  const host = await person(browser);
  await host.goto("/");
  await host.getByRole("button", { name: "Neue Runde starten" }).click();
  await host.getByPlaceholder("z. B. Julian").fill("Julian");
  await host.getByPlaceholder("z. B. Taverna Nikos").fill("Taverna Nikos");
  await host.getByRole("button", { name: "Runde starten" }).click();
  const code = (await host.locator("div.tracking-\\[0\\.25em\\]").textContent())!.trim();
  await host.getByRole("button", { name: "Schließen" }).click();

  const anna = await person(browser);
  await anna.goto(`/s/${code}`);
  await anna.getByPlaceholder("Dein Name").fill("Anna");
  await anna.getByRole("button", { name: "Beitreten" }).click();
  const ben = await person(browser);
  await ben.goto(`/s/${code}`);
  await ben.getByPlaceholder("Dein Name").fill("Ben");
  await ben.getByRole("button", { name: "Beitreten" }).click();
  await expect(host.getByText("Ben ist dabei")).toBeVisible();

  // Während des Essens
  await chat(anna, "hatte 2 mythos und den tzatziki hab ich mit ben geteilt");
  await chat(ben, "Gyros Teller und ein großes Mythos");
  await chat(host, "Hähnchen Souvlaki + Bauernsalat");
  for (const p of [anna, ben, host]) await expect(p.getByText(/Notiert/).first()).toBeVisible({ timeout: 60_000 });

  // Anna fotografiert noch ihren Teller
  await anna.getByTestId("photo-input").setInputFiles(PLATE);
  await expect(anna.getByRole("button", { name: "Das ist meins – übernehmen" })).toBeVisible({ timeout: 60_000 });
  await shot(anna, "1-foto");

  await shot(anna, "2-chat");

  // Bon
  await host.getByRole("button", { name: "Bon" }).click();
  await host.getByTestId("receipt-input").setInputFiles(RECEIPT);
  await expect(host.getByText("ΓΥΡΟΣ ΧΟΙΡΙΝΟ ΠΙΑΤΟ")).toBeVisible({ timeout: 120_000 });
  await expect(host.getByText("Die KI ordnet zu")).toBeHidden({ timeout: 120_000 });
  await shot(host, "3-bon");

  // Anna bekommt eine Rückfrage zur Mythos-Größe und antwortet per Button
  await anna.getByRole("button", { name: "Chat" }).click();
  const card = anna.locator('[data-testid="question"][data-open="1"][data-for-me="1"]').first();
  await expect(card).toBeVisible({ timeout: 60_000 });
  await shot(anna, "4-rueckfrage");
  const option = card.getByRole("button", { name: /330|0,33|0,3|klein/ }).first();
  await option.click();
  await expect(anna.getByText(/^↳/).first()).toBeVisible();

  // Beträge
  await anna.getByRole("button", { name: /€|Ich/ }).nth(0).click();
  await shot(anna, "5-ich");
  await ben.getByRole("button", { name: /€|Ich/ }).nth(0).click();
  await shot(ben, "6-ben");

  // Host verteilt Rest und prüft Gesamtsumme
  await host.getByRole("button", { name: "Host" }).click();
  await shot(host, "7-host");
  const restButton = host.getByRole("button", { name: "Rest verteilen" });
  if (await restButton.isEnabled()) {
    await restButton.click();
    await host.getByRole("button", { name: /Auf 3 Personen verteilen/ }).click();
  }
  await expect(host.getByTestId("open-sum")).toHaveText("0,00 €");
  const totals = (await host.getByTestId("person-total").allTextContents()).map(money);
  expect(Math.abs(totals.reduce((a, b) => a + b, 0) - 75.5 * 1.1)).toBeLessThan(0.02);
  await shot(host, "8-host-fertig");
});
