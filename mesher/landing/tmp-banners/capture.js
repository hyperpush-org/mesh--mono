const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await context.newPage();

  const publicDir = path.resolve(__dirname, '../public');

  // 1. X Banner (1500x500)
  console.log('Capturing X banner...');
  await page.goto(`file://${path.resolve(__dirname, 'banner.html')}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000); // wait for fonts
  const banner = await page.$('#x-banner');
  await banner.screenshot({ path: path.join(publicDir, 'x-banner.png') });
  console.log('✓ x-banner.png');

  // 2. Promo images
  console.log('Capturing promo images...');
  await page.goto(`file://${path.resolve(__dirname, 'promos.html')}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000); // wait for fonts

  const promoOSS = await page.$('#promo-oss');
  await promoOSS.screenshot({ path: path.join(publicDir, 'promo-oss.png') });
  console.log('✓ promo-oss.png');

  const promoPerf = await page.$('#promo-performance');
  await promoPerf.screenshot({ path: path.join(publicDir, 'promo-performance.png') });
  console.log('✓ promo-performance.png');

  const promoFlywheel = await page.$('#promo-flywheel');
  await promoFlywheel.screenshot({ path: path.join(publicDir, 'promo-flywheel.png') });
  console.log('✓ promo-flywheel.png');

  // 3. Sentry Swap promo (1200x675)
  console.log('Capturing sentry swap...');
  await page.goto(`file://${path.resolve(__dirname, 'sentry-swap.html')}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const sentrySwap = await page.$('#sentry-swap');
  await sentrySwap.screenshot({ path: path.join(publicDir, 'sentry-swap.png') });
  console.log('✓ sentry-swap.png');

  // 4. VS Sentry Pricing comparison (1200x675)
  console.log('Capturing vs-sentry pricing...');
  await page.goto(`file://${path.resolve(__dirname, 'vs-sentry-pricing.html')}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const vsSentry = await page.$('#vs-sentry-pricing');
  await vsSentry.screenshot({ path: path.join(publicDir, 'vs-sentry-pricing.png') });
  console.log('✓ vs-sentry-pricing.png');

  await browser.close();
  console.log('\nDone! All images saved to public/');
})();
