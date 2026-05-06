const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const shots = [
    { file: 'mockup-sidebar.html', out: 'sidebar.png', width: 900, height: 580 },
    { file: 'mockup-output.html', out: 'output.png', width: 860, height: 480 },
    { file: 'mockup-newspec.html', out: 'newspec.png', width: 860, height: 480 },
  ];

  for (const s of shots) {
    await page.setViewportSize({ width: s.width, height: s.height });
    await page.goto('file://' + path.join(__dirname, s.file));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(__dirname, s.out), fullPage: false });
    console.log('✓', s.out);
  }

  await browser.close();
})();
