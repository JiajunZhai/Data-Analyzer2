WITH
-- 1. 基础日志清洗
base_log AS (
SELECT
  CAST(installed_at AS date) AS install_date,
  app_code,
  app_version,
  country_code,
  CASE WHEN LOWER(network_name) = 'instagram installs' THEN 'facebook' ELSE network_name END AS network_name,
  ad_id,
  ad_type,
  ad_revenue_network,
  revenue_usd,
  activity_kind,
  event_name,
  (dt - CAST(installed_at AS date)) AS day_x
FROM bi_ods.ods_user_adjust_log_rt
WHERE dt >= CURRENT_DATE - INTERVAL '17 days'
  AND dt <= CURRENT_DATE
  AND installed_at >= (CURRENT_DATE - INTERVAL '10 days')::text
  AND dt - CAST(installed_at AS date) <= 7
  -- 同期小时对齐：只统计当前整点之前的数据，每天对比口径一致
  AND date_trunc('hour', to_timestamp(created_at)) < date_trunc('hour', CURRENT_TIMESTAMP)
  AND (LOWER(app_code) LIKE '%rm%' OR LOWER(app_code) LIKE '%r3%' OR LOWER(app_code) LIKE '%fr%'
       OR LOWER(app_code) LIKE '%vd%' OR LOWER(app_code) LIKE '%vc%' OR LOWER(app_code) LIKE '%pt%'
       OR LOWER(app_code) LIKE '%rl%')
),

-- 2. 广告收益数据聚合
ad_revenue_data AS (
SELECT
  install_date,
  app_code,
  app_version,
  country_code,
  network_name,
  ad_type,
  ad_revenue_network,
  day_x,
  COUNT(DISTINCT ad_id) AS ad_user_count,
  COUNT(*) AS ad_count,
  COALESCE(SUM(revenue_usd), 0) AS ad_profit
FROM base_log
WHERE activity_kind = 'ad_revenue'
GROUP BY
  install_date,
  app_code,
  app_version,
  country_code,
  network_name,
  ad_type,
  ad_revenue_network,
  day_x
HAVING COUNT(DISTINCT ad_id) >= 10
),

-- 3. 新用户数统计
new_user_data AS (
SELECT
  install_date,
  app_code,
  app_version,
  country_code,
  network_name,
  COUNT(DISTINCT ad_id) AS user_count
FROM base_log
GROUP BY install_date, app_code, app_version, country_code, network_name
HAVING COUNT(DISTINCT ad_id) > 30
),

-- 4. 点击数据聚合
ad_click_data AS (
SELECT
  install_date,
  app_code,
  app_version,
  country_code,
  network_name,
  ad_type,
  ad_revenue_network,
  day_x,
  COUNT(*) AS ad_click_count
FROM base_log
WHERE event_name = 'ad_click'
GROUP BY
  install_date,
  app_code,
  app_version,
  country_code,
  network_name,
  ad_type,
  ad_revenue_network,
  day_x
)

-- 5. 主查询
SELECT
  a.install_date AS "安装日期",
  a.day_x AS "生命周期",
  a.country_code AS "国家",
  a.app_code AS "应用",
  a.app_version AS "版本",
  a.network_name AS "渠道",
  b.user_count AS "注册用户",
  a.ad_type AS "广告类型",
  a.ad_revenue_network AS "广告变现渠道",
  a.ad_user_count AS "曝光人数",
  a.ad_count AS "曝光次数",
  a.ad_profit AS "广告收益",
  COALESCE(c.ad_click_count, 0) AS "点击次数"
FROM ad_revenue_data a
INNER JOIN new_user_data b
  ON a.install_date = b.install_date
  AND a.app_code = b.app_code
  AND a.app_version = b.app_version
  AND a.country_code = b.country_code
  AND a.network_name = b.network_name
LEFT JOIN ad_click_data c
  ON a.install_date = c.install_date
  AND a.app_code = c.app_code
  AND a.app_version = c.app_version
  AND a.country_code = c.country_code
  AND a.network_name = c.network_name
  AND a.ad_type = c.ad_type
  AND a.ad_revenue_network = c.ad_revenue_network
  AND a.day_x = c.day_x
ORDER BY a.install_date DESC, a.country_code, a.app_code, a.ad_type, a.ad_revenue_network;