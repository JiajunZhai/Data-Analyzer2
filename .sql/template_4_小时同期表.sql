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
WHERE dt >= CURRENT_DATE - INTERVAL '8 days'
  AND dt <= CURRENT_DATE
  AND installed_at >= (CURRENT_DATE - INTERVAL '10 days')::text
  AND dt - CAST(installed_at AS date) <= 7
  -- 同期小时对齐：只统计当前整点之前的数据，每天对比口径一致
  AND date_trunc('hour', to_timestamp(created_at)) < date_trunc('hour', CURRENT_TIMESTAMP)
  AND (LOWER(app_code) LIKE '%rm%' OR LOWER(app_code) LIKE '%r3%' OR LOWER(app_code) LIKE '%fr%'
       OR LOWER(app_code) LIKE '%vd%' OR LOWER(app_code) LIKE '%vc%' OR LOWER(app_code) LIKE '%pt%'
       OR LOWER(app_code) LIKE '%rl%')
),

-- 2. 混合粒度聚合（极致性能：利用 GROUPING SETS 实现无 JOIN 计算）
aggregated_data AS (
SELECT
  install_date,
  app_code,
  app_version,
  country_code,
  network_name,
  
  -- 识别当前行是否为大盘 ALL 汇总行：1 代表是，0 代表是明细拆分行
  GROUPING(day_x) AS is_all_row,
  CASE WHEN GROUPING(day_x) = 1 THEN 'ALL' ELSE CAST(day_x AS varchar) END AS day_x,
  CASE WHEN GROUPING(ad_type) = 1 THEN 'ALL' ELSE COALESCE(ad_type, 'Unknown') END AS ad_type,
  CASE WHEN GROUPING(ad_revenue_network) = 1 THEN 'ALL' ELSE COALESCE(ad_revenue_network, 'Unknown') END AS ad_revenue_network,
  
  -- 行为级去重指标：曝光人数（大盘行和明细行都会准确去重计算）
  COUNT(DISTINCT CASE WHEN activity_kind = 'ad_revenue' THEN ad_id END) AS ad_user_count,
  
  -- 行为级累加指标
  COUNT(CASE WHEN activity_kind = 'ad_revenue' THEN 1 END) AS ad_count,
  COALESCE(SUM(CASE WHEN activity_kind = 'ad_revenue' THEN revenue_usd END), 0) AS ad_profit,
  COUNT(CASE WHEN event_name = 'ad_click' THEN 1 END) AS ad_click_count,
  
  -- 属性级去重指标：注册用户临时统计（当天该买量渠道新增的总人数）
  COUNT(DISTINCT ad_id) AS temp_user_count
FROM base_log
GROUP BY GROUPING SETS (
  -- 组合 1：明细拆分层级 (包含生命周期、广告类型、渠道的所有交叉组合)
  (install_date, app_code, app_version, country_code, network_name, day_x, ad_type, ad_revenue_network),
  -- 组合 2：新增用户大盘汇总层级 (无任何变现/生命周期拆分)
  (install_date, app_code, app_version, country_code, network_name)
)
)

-- 3. 主查询：输出最终平铺表，应用“安全隔离”
SELECT
  a.install_date AS "安装日期",
  a.day_x AS "生命周期",
  a.country_code AS "国家",
  a.app_code AS "应用",
  a.app_version AS "版本",
  a.network_name AS "买量渠道",
  
  -- 【方案 B 安全隔离核心】：注册用户在明细行强制置为 NULL，只有在 ALL 大盘行才输出真实值，完美防止透视表求和暴增
  CASE WHEN a.is_all_row = 1 THEN a.temp_user_count ELSE NULL END AS "注册用户",
  
  a.ad_type AS "广告类型",
  a.ad_revenue_network AS "变现渠道",
  a.ad_user_count AS "曝光人数",
  a.ad_count AS "曝光次数",
  a.ad_profit AS "广告收益",
  a.ad_click_count AS "点击次数"
FROM aggregated_data a
-- 【方案 A 过滤逻辑配合】：
-- 3.1 对于大盘行(is_all_row = 1)，过滤掉注册新用户小于 10 的记录
-- 3.2 对于明细行(is_all_row = 0)，过滤掉曝光人数小于 10 的记录
WHERE (a.is_all_row = 1 AND a.temp_user_count >= 10)
   OR (a.is_all_row = 0 AND a.ad_user_count >= 10)
ORDER BY a.install_date DESC, a.country_code, a.app_code, a.is_all_row DESC, a.ad_type, a.ad_revenue_network;