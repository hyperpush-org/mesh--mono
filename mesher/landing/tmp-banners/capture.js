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

  // 2. OSS announcement banner (1200x628)
  console.log('Capturing OSS announcement...');
  await page.goto(`file://${path.resolve(__dirname, 'oss-announcement.html')}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000); // wait for fonts
  const ossAnnouncement = await page.$('#banner');
  await ossAnnouncement.screenshot({ path: path.join(publicDir, 'oss-announcement.png') });
  console.log('✓ oss-announcement.png');

  // 3. Promo images
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

  // 4. Token pricing promo (1200x675)
  console.log('Capturing promo token pricing...');
  await page.goto(`file://${path.resolve(__dirname, 'promo-token-pricing.html')}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const promoTokenPricing = await page.$('#promo-token-pricing');
  await promoTokenPricing.screenshot({ path: path.join(publicDir, 'promo-token-pricing.png') });
  console.log('✓ promo-token-pricing.png');

  // 5. Sentry Swap promo (1200x675)
  console.log('Capturing sentry swap...');
  await page.goto(`file://${path.resolve(__dirname, 'sentry-swap.html')}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const sentrySwap = await page.$('#sentry-swap');
  await sentrySwap.screenshot({ path: path.join(publicDir, 'sentry-swap.png') });
  console.log('✓ sentry-swap.png');

  // 6. Package Challenge (1200x675)
  console.log('Capturing package challenge...');
  await page.goto(`file://${path.resolve(__dirname, 'package-challenge.html')}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const pkgChallenge = await page.$('#package-challenge');
  await pkgChallenge.screenshot({ path: path.join(publicDir, 'package-challenge.png') });
  console.log('✓ package-challenge.png');

  // 7. VS Sentry Pricing comparison (1200x675)
  console.log('Capturing vs-sentry pricing...');
  await page.goto(`file://${path.resolve(__dirname, 'vs-sentry-pricing.html')}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const vsSentry = await page.$('#vs-sentry-pricing');
  await vsSentry.screenshot({ path: path.join(publicDir, 'vs-sentry-pricing.png') });
  console.log('✓ vs-sentry-pricing.png');

  // 8. Roadmap banner (1000x1800, tall/vertical)
  console.log('Capturing roadmap banner...');
  await page.goto(`file://${path.resolve(__dirname, 'roadmap.html')}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000); // wait for fonts
  const roadmap = await page.$('#roadmap-banner');
  await roadmap.screenshot({ path: path.join(publicDir, 'roadmap-banner.png') });
  console.log('✓ roadmap-banner.png');

  await browser.close();
  console.log('\nDone! All images saved to public/');
})();
