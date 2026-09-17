import { expect, type Locator, type Page, test } from '@playwright/test';

async function openFilter(page: Page, label: string) {
  const direct = page
    .locator('.admob-filter-bar > .filter-chip-wrapper > .filter-chip')
    .filter({ hasText: `全部${label}` });
  if (await direct.count()) {
    await direct.click();
  } else {
    if (!(await page.locator('.more-filters-dropdown').count()))
      await page.locator('.more-filters-trigger').click();
    const trigger = page.locator('.more-filter-trigger').filter({ hasText: `全部${label}` });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
  }
}

async function expectUnclipped(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect
    .poll(() =>
      locator.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return hit !== null && element.contains(hit);
      })
    )
    .toBe(true);
}

test('上传后日期、应用和更多筛选菜单可以直接操作', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await page.getByRole('button', { name: '数据源 ▼', exact: true }).click();
  await page.locator('.file-capsule:not(.file-capsule-mapping) input[type="file"]').setInputFiles({
    name: 'filters.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '日期,应用,注册用户,版本,买量渠道,国家,广告类型\n2026-09-01,App A,10,1.0,渠道甲,中国,横幅\n2026-09-02,App B,20,2.0,渠道乙,美国,插屏'
    ),
  });
  await page.locator('.date-range-chip-wrapper .filter-chip').first().click();
  await expectUnclipped(page.locator('.date-range-dropdown .date-range-presets button').first());
  await page.locator('h1').click();
  await openFilter(page, '应用');
  const appMenu = page.locator('.filter-dropdown-menu:visible');
  await expectUnclipped(appMenu.getByPlaceholder('搜索应用...'));
  await appMenu.getByLabel('App B', { exact: true }).uncheck();
  await appMenu.getByRole('button', { name: '确认', exact: true }).click();
  await expect(
    page.locator('.filter-chip, .more-filter-trigger').filter({ hasText: 'App A' })
  ).toBeVisible();
  await expect
    .poll(() => page.locator('.admob-filter-bar').evaluate((e) => e.getBoundingClientRect().height))
    .toBeLessThan(45);
  await page.getByTitle('重置所有筛选', { exact: true }).click();
  await page.locator('.more-filters-trigger').click();
  const moreMenu = page.locator('.more-filters-dropdown');
  const subTrigger = moreMenu.locator('.more-filter-trigger').filter({ hasText: '全部广告类型' });
  await expectUnclipped(subTrigger);
  await subTrigger.click();
  const subMenu = moreMenu.locator('.filter-dropdown-menu:visible');
  await expectUnclipped(subMenu.getByPlaceholder('搜索广告类型...'));
  await subMenu.getByLabel('插屏', { exact: true }).uncheck();
  await subMenu.getByRole('button', { name: '确认', exact: true }).click();
  await page.screenshot({ path: test.info().outputPath('filters.png') });
  expect(errors).toEqual([]);
});

test('148 个国家和安装日期字段的菜单保持在可操作区域', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '数据源 ▼', exact: true }).click();
  const rows = Array.from(
    { length: 148 },
    (_, i) => `2026-09-01,2026-09-02,App ${i % 2},10,1.0,渠道甲,国家${i},1,横幅`
  );
  await page.locator('.file-capsule:not(.file-capsule-mapping) input[type="file"]').setInputFiles({
    name: 'countries.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      ['安装日期,日期,应用,注册用户,版本,买量渠道,国家,生命周期,广告类型', ...rows].join('\n')
    ),
  });
  await openFilter(page, '国家');
  const menu = page.locator('.filter-dropdown-menu:visible');
  await expectUnclipped(menu.getByPlaceholder('搜索国家...'));
  await menu.getByRole('button', { name: '确认', exact: true }).scrollIntoViewIfNeeded();
  await expectUnclipped(menu.getByRole('button', { name: '确认', exact: true }));
  await menu.getByPlaceholder('搜索国家...').fill('国家147');
  await menu.getByLabel('国家147', { exact: true }).uncheck();
  await menu.getByRole('button', { name: '确认', exact: true }).click();
  await expect(
    page.locator('.filter-chip, .more-filter-trigger').filter({ hasText: '已选 147 个' })
  ).toBeVisible();
});

test('筛选栏保持单行，只包含维度且保留数值生命周期', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '数据源 ▼', exact: true }).click();
  const rows = Array.from(
    { length: 40 },
    (_, i) =>
      `2026-09-01,2026-09-02,App ${i % 2},1.0,渠道甲,国家${i},${i % 3},横幅,场景甲,场景乙,渠道乙,${(i % 2) + 10},${(i % 2) + 20},${(i % 2) + 30},${(i % 2) + 40},${(i % 2) + 50},${i % 2},${i % 2},${i % 2}`
  );
  await page.locator('.file-capsule:not(.file-capsule-mapping) input[type="file"]').setInputFiles({
    name: 'metrics.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      [
        '安装日期,日期,应用,版本,买量渠道,国家,生命周期,广告类型,标准广告场景,聚合广告场景,变现渠道,注册用户,曝光人数,曝光次数,点击次数,广告收益,CTR,渗透率,IPU',
        ...rows,
      ].join('\n')
    ),
  });
  const bar = page.locator('.admob-filter-bar');
  await expect(bar).toBeVisible();
  await expect.poll(() => bar.evaluate((e) => e.getBoundingClientRect().height)).toBeLessThan(45);
  await page.locator('.more-filters-trigger').click();
  for (const metric of [
    '注册用户',
    '曝光人数',
    '曝光次数',
    '点击次数',
    '广告收益',
    'CTR',
    '渗透率',
    'IPU',
    'eCPM',
    'ARPU',
  ]) {
    await expect(
      bar.locator('.chip-text, .more-filter-label').filter({ hasText: metric })
    ).toHaveCount(0);
  }
  await expect(
    bar.locator('.chip-text, .more-filter-label').filter({ hasText: '生命周期' })
  ).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath('dimensions-only.png') });
  const dateInMore = page.locator('.more-filters-dropdown .date-range-chip-wrapper .filter-chip');
  if (await dateInMore.count()) {
    await dateInMore.first().click();
    await expectUnclipped(page.locator('.more-filters-dropdown .date-preset-item').first());
  }
  await page.locator('h1').click();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect.poll(() => bar.evaluate((e) => e.getBoundingClientRect().height)).toBeLessThan(45);
  await page.screenshot({ path: test.info().outputPath('wide-toolbar.png') });
});
