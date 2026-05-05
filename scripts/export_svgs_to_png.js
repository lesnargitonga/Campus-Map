const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

(async () => {
  const root = path.resolve(__dirname, '..', 'figures');
  const outDir = path.resolve(root, 'previews');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const files = [
    'Figure_2_1_Conceptual_Framework_v2_colored.svg',
    'Figure_2_1_Conceptual_Framework_v2_highcontrast.svg'
  ];

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  for (const f of files) {
    const filePath = 'file://' + path.join(root, f);
    await page.goto(filePath);
    // Wait for SVG root
    await page.waitForSelector('svg');
    const svgHandle = await page.$('svg');

    // Try to read explicit width/height or fall back to viewBox
    const size = await page.evaluate(() => {
      const svg = document.querySelector('svg');
      if (!svg) return null;
      const w = svg.getAttribute('width');
      const h = svg.getAttribute('height');
      const vb = svg.getAttribute('viewBox');
      return { w, h, vb };
    });

    let width = 1200, height = 420;
    if (size) {
      if (size.w && size.h) {
        width = parseInt(size.w, 10) || width;
        height = parseInt(size.h, 10) || height;
      } else if (size.vb) {
        const parts = size.vb.split(/\s+/).map(Number);
        if (parts.length === 4) {
          width = Math.ceil(parts[2]);
          height = Math.ceil(parts[3]);
        }
      }
    }

    // Ensure viewport large enough
    await page.setViewport({ width, height });

  // Give page a moment to reflow
  await new Promise(resolve => setTimeout(resolve, 150));

    const outPath = path.join(outDir, f.replace('.svg', '.png'));
    // Screenshot the full page to be safe
    await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width, height }, omitBackground: false });
    console.log('Saved', outPath, '(' + width + 'x' + height + ')');
  }

  await browser.close();
})();
