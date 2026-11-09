// Erzeugt ein stilisiertes "Tellerfoto" (eigener Teller vorne, fremder Teller am Rand) für Tests.
// Aufruf: node e2e/fixtures/make-plate.mjs
import { chromium } from "playwright";
import path from "node:path";

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;width:1200px;height:900px;background:radial-gradient(circle at 50% 60%,#a0764e,#6b4a2e);position:relative;overflow:hidden}
.plate{position:absolute;border-radius:50%;background:radial-gradient(circle,#fff 60%,#e9e6e0 61%,#fff 70%);box-shadow:0 18px 40px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center}
.e{font-family:'Noto Color Emoji',sans-serif;line-height:1}
</style></head><body>
<div class="plate" style="left:330px;top:300px;width:540px;height:540px"><span class="e" style="font-size:260px">🥙</span></div>
<span class="e" style="position:absolute;left:900px;top:120px;font-size:230px">🍺</span>
<div class="plate" style="left:-120px;top:-140px;width:380px;height:380px"><span class="e" style="font-size:150px;margin:120px 0 0 110px">🍟</span></div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.setContent(html);
await page.waitForTimeout(300);
const out = path.join(import.meta.dirname, "plate.jpg");
await page.screenshot({ path: out, type: "jpeg", quality: 80 });
await browser.close();
console.log("geschrieben:", out);
