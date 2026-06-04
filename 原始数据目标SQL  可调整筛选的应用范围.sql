WITH
-- 1. 统计广告场景数据（基础曝光/收益数据，包含单场景与大盘汇总）
scene AS (
SELECT
  dt,
  app_code,
  app_version,
  country_code,
  network_name,
  -- 使用 GROUPING 函数区分：如果是汇总行则命名为 'ALL'，否则保留原场景名
  CASE WHEN GROUPING(scene_name) = 1 THEN 'ALL' ELSE scene_name END AS scene,
  COUNT(DISTINCT ad_id) AS ad_user_count,
  COUNT(*) AS ad_count,  -- 修复：COUNT() → COUNT(*)
  COALESCE(SUM(revenue_usd), 0) AS ad_profit
FROM bi_ods.ods_user_adjust_log_rt suar
WHERE  dt >= CURRENT_DATE - INTERVAL '7 days'
  AND dt = installed_at::date
  AND activity_kind = 'ad_revenue'
  AND LOWER(app_code) IN ('rm06b', 'rm08')
GROUP BY 
  dt, 
  app_code, 
  app_version, 
  country_code, 
  network_name, 
  GROUPING SETS ((scene_name), ())
HAVING COUNT(DISTINCT ad_id) >= 10
),

-- 2. 统计新用户数（无场景维度，保持与基础维度一致）
new_user_data AS (
SELECT
  dt,
  app_code,
  app_version,
  country_code,
  network_name,
  COUNT(DISTINCT ad_id) AS user_count
FROM bi_ods.ods_user_adjust_log_rt suar
WHERE  dt >= CURRENT_DATE - INTERVAL '7 days'
  AND dt = installed_at::date
  AND LOWER(app_code) IN ('rm06b', 'rm08')
GROUP BY dt, app_code, app_version, country_code, network_name
HAVING COUNT(DISTINCT ad_id) >= 50
),

-- 3. 统计广告点击数据（包含单场景与大盘汇总）
ad_click_data AS (
SELECT
  dt,
  app_code,
  app_version,
  country_code,
  network_name,
  CASE WHEN GROUPING(scene_name) = 1 THEN 'ALL' ELSE scene_name END AS scene,
  COUNT(*) AS ad_click_count  -- 修复：COUNT() → COUNT(*)
FROM bi_ods.ods_user_adjust_log_rt suar
WHERE  dt >= CURRENT_DATE - INTERVAL '7 days'
  AND dt = installed_at::date
  AND event_name = 'ad_click'
  AND LOWER(app_code) IN ('rm06b', 'rm08')
GROUP BY 
  dt, 
  app_code, 
  app_version, 
  country_code, 
  network_name, 
  GROUPING SETS ((scene_name), ())
)

-- 主查询
SELECT
  a.dt AS "日期",
  a.country_code AS "国家",
  a.app_code AS "应用",
  a.network_name AS "渠道",
  a.app_version AS "版本",
  COALESCE(b.user_count, 0) AS "注册用户",
  a.scene AS "广告场景",
  a.ad_user_count AS "曝光人数",
  a.ad_count AS "曝光次数",
  a.ad_profit AS "广告收益",