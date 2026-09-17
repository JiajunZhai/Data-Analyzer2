import { expect, type Locator, test } from '@playwright/test';

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
  await page.goto('/');
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
  await page.locator('.filter-chip').filter({ hasText: '全部应用' }).click();
  const appMenu = page.locator('.filter-dropdown-menu:visible');
  await expectUnclipped(appMenu.getByPlaceholder('搜索应用...'));
  await appMenu.getByLabel('App B', { exact: true }).uncheck();
  await appMenu.getByRole('button', { name: '确认', exact: true }).click();
  await expect(page.locator('.filter-chip').filter({ hasText: '应用: App A' })).toBeVisible();
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
  expect(errors).toEqual([]);
});
