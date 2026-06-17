WITH
-- 参数化常量：避免每行重复计算日期边界
params AS (
  SELECT
    CURRENT_DATE::date                          AS today,
    (CURRENT_DATE - INTERVAL '10 days')::date   AS dt_floor,
    (CURRENT_DATE - INTERVAL '10 days')::date   AS install_floor
),

-- 1. 基础日志清洗：仅扫描1次原表，强制命中dt索引裁剪分区
-- 优化点：
--   a) installed_at 预先 CAST 一次，后续用 install_date 比较，可命中索引
--   b) app_code 用 POSITION 替代 7 个 LIKE '%xx%'，减少 CPU 开销
--   c) params CTE 避免每行重复调用 CURRENT_DATE
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
FROM bi_ods.ods_user_adjust_log_rt, params p
WHERE
  -- dt 索引前置过滤：裁剪历史分区
  dt >= p.dt_floor
  -- installed_at 先 CAST 再比较（仅1次 CAST，优化器可下推）
  AND CAST(installed_at AS date) >= p.install_floor
  -- 生命周期窗口
  AND dt >= installed_at::date
  AND dt <= CAST(installed_at AS date) + INTERVAL '7 days'
  -- 应用过滤：POSITION 比 LIKE '%xx%' 快（避免正则引擎）
  AND (
    POSITION('rm' IN LOWER(app_code)) > 0 OR POSITION('r3' IN LOWER(app_code)) > 0
    OR POSITION('fr' IN LOWER(app_code)) > 0 OR POSITION('vd' IN LOWER(app_code)) > 0
    OR POSITION('vc' IN LOWER(app_code)) > 0 OR POSITION('pt' IN LOWER(app_code)) > 0
    OR POSITION('rl' IN LOWER(app_code)) > 0
  )
),

-- 2. 新用户数统计：按安装队列聚合，不拆分广告级维度
-- 用户数是队列总用户，不能按广告类型/生命周期拆分，否则会重复计数
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
),

-- 3. 广告明细聚合：合并收益+点击指标，一次分组完成
ad_detail_data AS (
SELECT
  install_date,
  app_code,
  app_version,
  country_code,
  network_name,
  ad_type,
  ad_revenue_network,
  day_x,
  -- 广告收益指标（仅统计ad_revenue活动）
  COUNT(DISTINCT CASE WHEN activity_kind = 'ad_revenue' THEN ad_id END) AS ad_user_count,
  COUNT(CASE WHEN activity_kind = 'ad_revenue' THEN 1 END) AS ad_count,
  COALESCE(SUM(CASE WHEN activity_kind = 'ad_revenue' THEN revenue_usd END), 0) AS ad_profit,
  -- 点击指标（仅统计ad_click事件）
  COUNT(CASE WHEN event_name = 'ad_click' THEN 1 END) AS ad_click_count
FROM base_log
GROUP BY
  install_date,
  app_code,
  app_version,
  country_code,
  network_name,
  ad_type,
  ad_revenue_network,
  day_x
-- 保留原有人数过滤逻辑
HAVING COUNT(DISTINCT CASE WHEN activity_kind = 'ad_revenue' THEN ad_id END) >= 10
)

-- 4. 主查询：仅做内存关联
-- 衍生指标(ARPU/eCPM/IPU)由项目 calculatedField.ts 统一计算
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
  COALESCE(a.ad_click_count, 0) AS "点击次数"
FROM ad_detail_data a
INNER JOIN new_user_data b
  ON a.install_date = b.install_date
  AND a.app_code = b.app_code
  AND a.app_version = b.app_version
  AND a.country_code = b.country_code
  AND a.network_name = b.network_name
-- 排序由项目透视表层（aggregator.ts sortKeys）负责，SQL 层不做排序以避免超时
-- ORDER BY a.install_date DESC, a.app_code, a.country_code, a.day_x, a.ad_type, a.ad_revenue_network;
