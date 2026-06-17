import { test, expect } from '@playwright/test';

test.describe('应用初始化', () => {
  test('应该显示应用标题', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Pivot Analysis');
  });

  test('应该显示文件上传区域', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.file-capsule')).toBeVisible();
  });
});

test.describe('数据源管理', () => {
  test('应该显示数据源管理按钮', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.datasource-trigger')).toBeVisible();
  });

  test('点击数据源按钮应该打开下拉菜单', async ({ page }) => {
    await page.goto('/');
    await page.locator('.datasource-trigger').click();
    await expect(page.locator('.datasource-dropdown')).toBeVisible();
  });
});

test.describe('布局结构', () => {
  test('应该显示值配置区', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.spatial-zone-values')).toBeVisible();
  });

  test('应该显示行配置区', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.spatial-zone-rows')).toBeVisible();
  });

  test('应该显示列配置区', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.spatial-zone-columns')).toBeVisible();
  });

  test('应该显示透视表区域', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.spatial-table')).toBeVisible();
  });
});
