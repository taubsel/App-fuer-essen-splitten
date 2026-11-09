import { expect, test } from "@playwright/test";
import path from "node:path";

const PLATE = path.join(__dirname, "fixtures", "plate.jpg");
const SHOTS = process.env.E2E_SCREENSHOTS;

test("Tellerfoto: KI markiert Speisen, Person wählt ab und übernimmt", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Neue Runde starten" }).click();
  await page.getByPlaceholder("z. B. Julian").fill("Mara");
  await page.getByRole("button", { name: "Runde starten" }).click();
  await page.getByRole("button", { name: "Schließen" }).click();

  await page.getByTestId("photo-input").setInputFiles(PLATE);
  const photo = page.getByAltText("Tellerfoto");
  await expect(photo).toBeVisible();

  // KI-Ergebnis: Gyros + Bier ausgewählt, Pommes am Rand nicht
  const confirm = page.getByRole("button", { name: "Das ist meins – übernehmen" });
  await expect(confirm).toBeVisible({ timeout: 30_000 });
  const beer = page.getByRole("button", { name: /Mythos Bier 0,5 l abwählen/ });
  await expect(beer).toBeVisible();
  await expect(page.getByRole("button", { name: /Pommes \(geteilt\?\) auswählen/ })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "09-foto-review.png") });

  // Bier war doch vom Nachbarn → abwählen
  await beer.click();
  await expect(page.getByRole("button", { name: /Mythos Bier 0,5 l auswählen/ })).toBeVisible();
  await confirm.click();

  await expect(page.getByText("Notiert vom Foto: 1× Gyros-Teller 👍")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Übernommen ✓")).toBeVisible();
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "10-foto-fertig.png") });

  await page.getByRole("button", { name: "Ich" }).click();
  await expect(page.getByText("📷 1× Gyros-Teller")).toBeVisible();
});
