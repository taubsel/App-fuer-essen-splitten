import { expect, test, type Browser, type Page } from "@playwright/test";
import path from "node:path";

const RECEIPT = path.join(__dirname, "fixtures", "receipt-greek.jpg");
const SHOTS = process.env.E2E_SCREENSHOTS;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

async function newPerson(browser: Browser) {
  const context = await browser.newContext({ ...(test.info().project.use as object) });
  return context.newPage();
}

async function chat(page: Page, text: string) {
  await page.getByRole("button", { name: "Chat" }).click();
  await page.getByPlaceholder(/Was hattest du/).fill(text);
  await page.getByRole("button", { name: "Senden" }).click();
}

test("komplette Runde: erstellen, beitreten, notieren, Bon, Rückfrage, Abrechnung", async ({ browser }) => {
  // --- Host startet die Runde
  const host = await newPerson(browser);
  await host.goto("/");
  await shot(host, "01-start");
  await host.getByRole("button", { name: "Neue Runde starten" }).click();
  await host.getByPlaceholder("z. B. Julian").fill("Julian");
  await host.getByPlaceholder("z. B. Taverna Nikos").fill("Taverna Test");
  await host.getByRole("button", { name: "Runde starten" }).click();
  await expect(host.getByRole("heading", { name: "Leute einladen" })).toBeVisible();
  const code = (await host.locator("div.tracking-\\[0\\.25em\\]").textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  await shot(host, "02-einladen");
  await host.getByRole("button", { name: "Schließen" }).click();

  // --- Anna und Ben treten bei
  const anna = await newPerson(browser);
  await anna.goto(`/s/${code}`);
  await expect(anna.getByText("Du wurdest eingeladen")).toBeVisible();
  await anna.getByPlaceholder("Dein Name").fill("Anna");
  await shot(anna, "03-beitreten");
  await anna.getByRole("button", { name: "Beitreten" }).click();
  await expect(anna.getByText("Taverna Test").first()).toBeVisible();

  const ben = await newPerson(browser);
  await ben.goto(`/s/${code}`);
  await ben.getByPlaceholder("Dein Name").fill("Ben");
  await ben.getByRole("button", { name: "Beitreten" }).click();
  await expect(ben.getByText("Ben ist dabei")).toBeVisible();

  // Live-Update beim Host
  await expect(host.getByText("Ben ist dabei")).toBeVisible();

  // --- Während des Essens notieren
  await chat(anna, "2 Mythos und Tzatziki mit Ben geteilt");
  await expect(anna.getByText("Notiert: 2× Mythos").first()).toBeVisible();
  await chat(ben, "Gyros Teller, 1 Mythos 0,5");
  await expect(ben.getByText(/Notiert: 1× Gyros Teller/).first()).toBeVisible();
  await chat(host, "Souvlaki und Griechischer Salat");
  await expect(host.getByText(/Notiert: 1× Souvlaki/).first()).toBeVisible();
  await shot(anna, "04-chat");

  // --- Host fotografiert den Bon
  await host.getByRole("button", { name: "Bon" }).click();
  await host.getByTestId("receipt-input").setInputFiles(RECEIPT);
  await expect(host.getByText("ΓΥΡΟΣ ΧΟΙΡΙΝΟ ΠΙΑΤΟ")).toBeVisible({ timeout: 30_000 });
  await expect(host.getByText("75,50 €").first()).toBeVisible();

  // Die KI ordnet automatisch zu und fragt Anna nach der Mythos-Größe
  await anna.getByRole("button", { name: "Chat" }).click();
  const question = anna.getByText("Du hattest 2× Mythos – welche Position auf dem Bon war das?");
  await expect(question).toBeVisible({ timeout: 30_000 });
  await shot(anna, "05-rueckfrage");
  await anna.getByRole("button", { name: "2× Mythos Bier 0,3 l" }).click();
  await expect(anna.getByText("↳ 2× Mythos Bier 0,3 l")).toBeVisible();

  // Anna: 2 × 3,50 + ½ Tzatziki 2,50 + Gedeck 1,00 = 10,50 + 10 % = 11,55
  await anna.getByRole("button", { name: /Ich|€/ }).nth(0).click();
  await expect(anna.getByTestId("my-total")).toHaveText("11,55 €");
  await shot(anna, "06-ich");
  await anna.getByRole("button", { name: "Passt so – bestätigen" }).click();
  await expect(anna.getByRole("button", { name: "✓ Bestätigt" })).toBeVisible();

  // Ben: Gyros 12,50 + Mythos 0,5 5,00 + ½ Tzatziki 2,50 + Gedeck 1,00 = 21,00 + 10 % = 23,10
  await ben.getByRole("button", { name: /Ich|€/ }).nth(0).click();
  await expect(ben.getByTestId("my-total")).toHaveText("23,10 €");

  // --- Host verteilt den Rest und schließt ab
  await host.getByRole("button", { name: "Host" }).click();
  await shot(host, "07-host-vorher");
  await host.getByRole("button", { name: "Rest verteilen" }).click();
  await host.getByRole("button", { name: /Auf 3 Personen verteilen/ }).click();
  await expect(host.getByTestId("open-sum")).toHaveText("0,00 €");
  await shot(host, "08-host-nachher");

  // Summe aller Beträge = Rechnung + 10 %
  const sum = 75.5 * 1.1;
  const totals = await host.getByTestId("person-total").allTextContents();
  const parsed = totals.map((t) => Number(t.replace(/[^\d,]/g, "").replace(",", ".")));
  expect(Math.abs(parsed.reduce((a, b) => a + b, 0) - sum)).toBeLessThan(0.05);

  host.on("dialog", (d) => d.accept());
  await host.getByRole("button", { name: "Runde abschließen" }).click();
  await expect(host.getByText("hat die Runde abgeschlossen").first()).toBeVisible({ timeout: 10_000 }).catch(() => {});
  await expect(host.getByRole("button", { name: "Runde wieder öffnen" })).toBeVisible();
});

test("Host kann eine Runde ohne Bon beenden, wieder öffnen und löschen", async ({ browser }) => {
  const host = await newPerson(browser);
  await host.goto("/");
  await host.getByRole("button", { name: "Neue Runde starten" }).click();
  await host.getByPlaceholder("z. B. Julian").fill("Julian");
  await host.getByPlaceholder("z. B. Taverna Nikos").fill("Wird gelöscht");
  await host.getByRole("button", { name: "Runde starten" }).click();
  const code = (await host.locator("div.tracking-\\[0\\.25em\\]").textContent())!.trim();
  await host.getByRole("button", { name: "Schließen" }).click();

  const guest = await newPerson(browser);
  await guest.goto(`/s/${code}`);
  await guest.getByPlaceholder("Dein Name").fill("Gast");
  await guest.getByRole("button", { name: "Beitreten" }).click();
  await expect(host.getByText("Gast ist dabei")).toBeVisible();

  // Ein Foto, das beim Löschen mit entfernt werden muss
  await guest.getByTestId("photo-input").setInputFiles(path.join(__dirname, "fixtures", "plate.jpg"));
  await expect(guest.getByAltText("Tellerfoto")).toBeVisible();

  // Beenden ohne Kassenzettel
  host.on("dialog", (d) => d.accept());
  await host.getByRole("button", { name: "Host" }).click();
  await host.getByRole("button", { name: "Runde beenden" }).click();
  await expect(host.getByRole("button", { name: "Runde wieder öffnen" })).toBeVisible();
  await expect(guest.getByText("Julian hat die Runde beendet.")).toBeVisible();
  await host.getByRole("button", { name: "Runde wieder öffnen" }).click();
  await expect(host.getByRole("button", { name: "Runde beenden" })).toBeVisible();

  // Löschen
  await host.getByRole("button", { name: "Runde löschen" }).click();
  await expect(host).toHaveURL(/\/$/);
  await expect(host.getByText("Runde gelöscht")).toBeVisible();
  await expect(host.getByText("Wird gelöscht")).toBeHidden();
  await expect(guest.getByText("der Host hat sie gelöscht")).toBeVisible({ timeout: 25_000 });
});
