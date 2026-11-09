// Erzeugt ein realistisch aussehendes griechisches Kassenzettel-Foto für Tests.
// Aufruf: node e2e/fixtures/make-receipt.mjs
import { chromium } from "playwright";
import path from "node:path";

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#8a7a66;display:flex;justify-content:center;align-items:center;height:1400px}
.r{width:520px;background:#fbfaf6;padding:36px 34px;font-family:'DejaVu Sans Mono',monospace;font-size:21px;color:#222;
transform:rotate(-2.2deg);box-shadow:0 12px 40px rgba(0,0,0,.45)}
h1{font-size:26px;text-align:center;margin:0 0 4px} .c{text-align:center} .row{display:flex;justify-content:space-between}
hr{border:0;border-top:2px dashed #555;margin:14px 0} .b{font-weight:bold;font-size:24px}
</style></head><body><div class="r">
<h1>ΤΑΒΕΡΝΑ Ο ΝΙΚΟΣ</h1><div class="c">ΠΛΑΤΕΙΑ ΑΓ. ΝΙΚΟΛΑΟΥ 4<br>ΝΑΞΟΣ · ΑΦΜ 099876543</div>
<div class="c">ΤΡΑΠΕΖΙ 12 · 09/11/2026 22:41</div><hr>
<div class="row"><span>4 x ΜΥΘΟΣ 330ML</span><span>14,00</span></div>
<div class="row"><span>2 x ΜΥΘΟΣ 500ML</span><span>10,00</span></div>
<div class="row"><span>1 x ΓΥΡΟΣ ΧΟΙΡΙΝΟ ΠΙΑΤΟ</span><span>12,50</span></div>
<div class="row"><span>1 x ΧΩΡΙΑΤΙΚΗ</span><span>9,00</span></div>
<div class="row"><span>1 x ΤΖΑΤΖΙΚΙ</span><span>5,00</span></div>
<div class="row"><span>2 x ΣΟΥΒΛΑΚΙ ΚΟΤΟΠΟΥΛΟ</span><span>22,00</span></div>
<div class="row"><span>3 x ΚΟΥΒΕΡ</span><span>3,00</span></div><hr>
<div class="row b"><span>ΣΥΝΟΛΟ</span><span>75,50 €</span></div>
<div class="row"><span>ΦΠΑ 13%</span><span>8,69</span></div><hr>
<div class="c">ΕΥΧΑΡΙΣΤΟΥΜΕ!</div></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 760, height: 1400 } });
await page.setContent(html);
const out = path.join(import.meta.dirname, "receipt-greek.jpg");
await page.screenshot({ path: out, type: "jpeg", quality: 80 });
await browser.close();
console.log("geschrieben:", out);
