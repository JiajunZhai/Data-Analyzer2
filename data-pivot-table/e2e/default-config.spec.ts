import { expect, test } from '@playwright/test';

for (const missingField of ['日期', '应用', '注册用户', null]) {
  test(`默认配置兼容缺失字段：${missingField ?? '完整字段'}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('button', { name: '数据源 ▼', exact: true }).click();
    const headers = ['日期', '应用', '注册用户', '渠道'].filter((name) => name !== missingField);
    const rows: Record<string, string>[] = [
      { 日期: '2026-09-01', 应用: 'App A', 注册用户: '10', 渠道: '渠道甲' },
      { 日期: '2026-09-02', 应用: 'App B', 注册用户: '20', 渠道: '渠道乙' },
    ];
    const csv = [headers.join(','), ...rows.map((row) => headers.map((name) => row[name]).join(','))].join('\n');
    await page.locator('.file-capsule:not(.file-capsule-mapping) input[type="file"]').setInputFiles({
      name: 'default-config.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
    });
    const chip = page.locator('.filter-chip').filter({ hasText: '全部渠道' });
    await expect(chip).toBeVisible();
    await chip.click();
    const menu = page.locator('.filter-dropdown-menu:visible');
    await menu.getByLabel('渠道乙', { exact: true }).uncheck();
    await menu.getByRole('button', { name: '确认', exact: true }).click();
    await expect(page.locator('.filter-chip').filter({ hasText: '渠道: 渠道甲' })).toBeVisible();
    await page.getByTitle('重置所有筛选', { exact: true }).click();
    await expect(chip).toBeVisible();
    await page.reload();
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(page.locator('.filter-dropdown-menu:visible').getByLabel('渠道乙', { exact: true })).toBeChecked();
    expect(errors).toEqual([]);
  });
}
