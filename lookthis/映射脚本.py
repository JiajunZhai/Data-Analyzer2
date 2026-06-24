import os
import xml.etree.ElementTree as ET
import csv

# 自动获取当前运行脚本 ys.py 所在的绝对目录路径
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 注册Excel命名空间
ET.register_namespace('ss', 'urn:schemas-microsoft-com:office:spreadsheet')

def parse_xml_to_dict(xml_name, sheet_name):
    """
    精确解析含有 ss:Index 偏移的 Excel XML，将其展平为一维字典
    """
    xml_path = os.path.join(BASE_DIR, xml_name)
    
    if not os.path.exists(xml_path):
        print(f"【读取失败】找不到文件: '{xml_name}'")
        print(f"  -> 脚本尝试寻找的绝对路径为: {xml_path}\n")
        return {}
        
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
    except Exception as e:
        print(f"【解析失败】读取 {xml_name} 失败: {e}\n")
        return {}
        
    namespaces = {
        'ss': 'urn:schemas-microsoft-com:office:spreadsheet'
    }
    
    worksheet = None
    for ws in root.findall('ss:Worksheet', namespaces):
        if ws.get('{urn:schemas-microsoft-com:office:spreadsheet}Name') == sheet_name:
            worksheet = ws
            break
            
    if not worksheet:
        print(f"【解析警告】未在 {xml_name} 中找到名为 '{sheet_name}' 的工作表。\n")
        return {}
        
    table = worksheet.find('ss:Table', namespaces)
    if table is None:
        return {}
        
    # 提取表头行（Col Index -> App Code）
    headers = {}
    row_elements = table.findall('ss:Row', namespaces)
    if not row_elements:
        return {}
        
    header_row = row_elements[0]
    col_idx = 1
    for cell in header_row.findall('ss:Cell', namespaces):
        index_attr = cell.get('{urn:schemas-microsoft-com:office:spreadsheet}Index')
        if index_attr:
            col_idx = int(index_attr)
        data = cell.find('ss:Data', namespaces)
        if data is not None and data.text is not None:
            headers[col_idx] = data.text.strip().lower()
        col_idx += 1

    # 提取数据行
    mappings = {}
    for row in row_elements[1:]:
        cells = row.findall('ss:Cell', namespaces)
        if not cells:
            continue
            
        first_cell = cells[0]
        data_el = first_cell.find('ss:Data', namespaces)
        if data_el is None or data_el.text is None:
            continue
        mapped_scenario = data_el.text.strip()
        
        if mapped_scenario in ('mapped_scenario', '场景累计', ''):
            continue
            
        col_idx = 1
        for cell in cells:
            index_attr = cell.get('{urn:schemas-microsoft-com:office:spreadsheet}Index')
            if index_attr:
                col_idx = int(index_attr)
                
            if col_idx == 1:
                col_idx += 1
                continue
                
            data = cell.find('ss:Data', namespaces)
            if data is not None and data.text is not None:
                raw_scene = data.text.strip().lower()
                if raw_scene and col_idx in headers:
                    app_code = headers[col_idx]
                    mappings[(app_code, raw_scene)] = mapped_scenario
            col_idx += 1
            
    return mappings

def generate_final_mapping():
    print(f"当前脚本运行物理目录为: {BASE_DIR}\n正在开始解析，请稍候...")
    
    l1_data = parse_xml_to_dict('场景映射.xml', '场景映射')
    l2_data = parse_xml_to_dict('聚合场景.xml', '聚合场景')
    
    if not l1_data and not l2_data:
        print("【错误】未读取到任何有效数据，放弃生成文件。")
        return

    all_keys = set(list(l1_data.keys()) + list(l2_data.keys()))
    
    # 1. 写入 CSV 文件
    csv_file = os.path.join(BASE_DIR, 'dim_scene_mapping.csv')
    try:
        with open(csv_file, mode='w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['app_code', 'raw_scene_name', 'scene_l1_name', 'scene_l2_name'])
            for app, scene in sorted(all_keys):
                l1_val = l1_data.get((app, scene), '')
                l2_val = l2_data.get((app, scene), '')
                writer.writerow([app, scene, l1_val, l2_val])
        print(f"-> 场景映射 CSV 成功输出至: {csv_file}")
    except Exception as e:
        print(f"写入 CSV 失败: {e}")

    # 2. 新增：直接生成可直接粘贴到 SQL 头部的 CTE VALUES 语句！
    sql_file = os.path.join(BASE_DIR, 'dim_scene_mapping_cte.sql')
    try:
        with open(sql_file, mode='w', encoding='utf-8') as f:
            f.write("dim_scene_mapping (app_code, raw_scene_name, scene_l1_name, scene_l2_name) AS (\n")
            f.write("  VALUES\n")
            
            sorted_keys = sorted(all_keys)
            total_keys = len(sorted_keys)
            
            for idx, (app, scene) in enumerate(sorted_keys):
                l1_val = l1_data.get((app, scene), '')
                l2_val = l2_data.get((app, scene), '')
                
                # 安全转义 SQL 中的单引号，防止语法报错
                app_esc = app.replace("'", "''")
                scene_esc = scene.replace("'", "''")
                l1_esc = l1_val.replace("'", "''")
                l2_esc = l2_val.replace("'", "''")
                
                line = f"    ('{app_esc}', '{scene_esc}', '{l1_esc}', '{l2_esc}')"
                
                if idx < total_keys - 1:
                    line += ",\n"
                else:
                    line += "\n"
                f.write(line)
            f.write(")")
        print(f"-> 【重要】SQL 内嵌式脚本已成功输出至: {sql_file}")
        print("   您可以直接在 VS Code 里打开该 .sql 文件，复制全部内容粘贴到您的 SQL 顶部。")
    except Exception as e:
        print(f"生成内联 SQL 失败: {e}")

if __name__ == '__main__':
    generate_final_mapping()