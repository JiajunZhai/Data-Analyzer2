WITH
-- 1. 基础日志清洗（严格锁定：仅统计当天注册的新用户在当天的行为）
base_log AS (
SELECT
  dt,
  app_code,
  app_version,
  country_code,
  -- 1.1 加上买量渠道清洗
  CASE WHEN LOWER(network_name) = 'instagram installs' THEN 'facebook' ELSE network_name END AS network_name,
  ad_id,
  revenue_usd,
  activity_kind,
  event_name
FROM bi_ods.ods_user_adjust_log_rt
WHERE dt >= CURRENT_DATE - INTERVAL '8 days'
  AND dt <= CURRENT_DATE
  -- 【核心修正】：限制日志日期等于安装日期，确保所有指标仅针对“当天注册的新用户”
  AND CAST(installed_at AS date) = dt
  AND (LOWER(app_code) LIKE '%rm%' OR LOWER(app_code) LIKE '%r3%' OR LOWER(app_code) LIKE '%fr%'
       OR LOWER(app_code) LIKE '%vd%' OR LOWER(app_code) LIKE '%vc%' OR LOWER(app_code) LIKE '%pt%'
       OR LOWER(app_code) LIKE '%rl%')
)

-- 2. 直接聚合（全为属性维度，数据完全可累加，无重复和失真风险）
SELECT
  dt AS "日期",
  country_code AS "国家",
  app_code AS "应用",
  app_version AS "版本",
  network_name AS "买量渠道",
  
  -- 2.1 注册用户：因为 base_log 已经锁定了安装日期=日志日期，所以直接对 ad_id 去重即为注册新用户数
  COUNT(DISTINCT ad_id) AS "注册用户",
  
  -- 2.2 行为级去重指标：当天注册的新用户中，当天产生曝光的去重人数（必然 <= 注册用户）
  COUNT(DISTINCT CASE WHEN activity_kind = 'ad_revenue' THEN ad_id END) AS "曝光人数",
  
  -- 2.3 行为级累加指标：仅统计当天新用户产生的曝光与点击
  COUNT(CASE WHEN activity_kind = 'ad_revenue' THEN 1 END) AS "曝光次数",
  COALESCE(SUM(CASE WHEN activity_kind = 'ad_revenue' THEN revenue_usd END), 0) AS "广告收益",
  COUNT(CASE WHEN event_name = 'ad_click' THEN 1 END) AS "点击次数"
FROM base_log
GROUP BY
  dt,
  app_code,
  app_version,
  country_code,
  network_name
-- 2.4 【过滤调整】：过滤掉注册用户（新用户数）小于 10 的记录
HAVING COUNT(DISTINCT ad_id) >= 10
ORDER BY dt DESC, country_code, app_code, network_name;