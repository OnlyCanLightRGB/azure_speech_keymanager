import requests
import json
import os
from datetime import datetime, timedelta


def get_access_token(tenant_id, client_id, client_secret):
    """获取Azure访问令牌"""
    token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    token_data = {
        'grant_type': 'client_credentials',
        'client_id': client_id,
        'client_secret': client_secret,
        'scope': 'https://management.azure.com/.default'
    }
    
    token_response = requests.post(token_url, data=token_data)
    if token_response.status_code != 200:
        print(f"获取令牌失败: {token_response.text}")
        return None
    
    access_token = token_response.json()['access_token']
    print("✅ 成功获取访问令牌")
    return access_token

def get_subscriptions(access_token):
    """获取订阅列表"""
    url = "https://management.azure.com/subscriptions?api-version=2020-01-01"
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }
    
    response = requests.get(url, headers=headers)
    if response.status_code != 200:
        print(f"获取订阅列表失败: {response.text}")
        return []
    
    subscriptions_data = response.json()
    subscriptions = subscriptions_data.get("value", [])
    
    print("Azure订阅列表:")
    print("=" * 80)
    print(f"总订阅数: {len(subscriptions)}")
    print()
    
    for i, sub in enumerate(subscriptions, 1):
        subscription_id = sub.get('subscriptionId', 'Unknown')
        display_name = sub.get('displayName', 'Unknown')
        state = sub.get('state', 'Unknown')
        
        print(f"订阅 {i}: {display_name}")
        print(f"  订阅ID: {subscription_id}")
        print(f"  状态: {state}")
        print("  " + "-" * 50)
    
    print("=" * 80)
    return subscriptions

def get_speech_service_costs(tenant_id, client_id, client_secret, subscription_id):
    """专门查询Speech服务的成本明细"""
    
    # 获取访问令牌
    access_token = get_access_token(tenant_id, client_id, client_secret)
    if not access_token:
        return None
    
    # 构建Cost Management查询
    url = f"https://management.azure.com/subscriptions/{subscription_id}/providers/Microsoft.CostManagement/query"
    
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }
    
    # 查询当月数据
    start_date = datetime.now().replace(day=1).strftime('%Y-%m-%d')
    end_date = datetime.now().strftime('%Y-%m-%d')
    
    # 专门针对Speech服务的查询
    query_body = {
        "type": "ActualCost",
        "timeframe": "Custom", 
        "timePeriod": {
            "from": start_date,
            "to": end_date
        },
        "dataset": {
            "granularity": "Daily",
            "aggregation": {
                "totalCost": {
                    "name": "PreTaxCost",
                    "function": "Sum"
                },
                "quantity": {
                    "name": "UsageQuantity",
                    "function": "Sum"
                }
            },
            "grouping": [
                {
                    "type": "Dimension",
                    "name": "ResourceId"
                },
                {
                    "type": "Dimension",
                    "name": "Meter"
                },
                # {
                #     "type": "Dimension", 
                #     "name": "UsageDate"
                # }
            ],
            "filter": {
                "dimensions": {
                    "name": "ServiceName",
                    "operator": "In",
                    "values": ["Cognitive Services"]
                }
            }
        }
    }
    
    params = {'api-version': '2021-10-01'}
    
    response = requests.post(url, headers=headers, json=query_body, params=params)
    
    if response.status_code == 200:
        data = response.json()
        
        # 解析并格式化数据
        if 'properties' in data and 'rows' in data['properties']:
            rows = data['properties']['rows']
            columns = [col['name'] for col in data['properties']['columns']]
            
            print("Speech服务成本明细:")
            print("=" * 80)
            
            total_cost = 0
            resources = {}
            
            for row in rows:
                row_data = dict(zip(columns, row))
                
                resource_id = row_data.get('ResourceId', 'Unknown')
                resource_name = resource_id.split('/')[-1] if '/' in str(resource_id) else resource_id
                cost = float(row_data.get('PreTaxCost', 0))
                quantity = float(row_data.get('UsageQuantity', 0))
                meter_name = row_data.get('Meter', 'Unknown')
                usage_date = row_data.get('UsageDate', 'Unknown')
                
                total_cost += cost
                
                if resource_name not in resources:
                    resources[resource_name] = {
                        'total_cost': 0,
                        'details': []
                    }
                
                resources[resource_name]['total_cost'] += cost
                resources[resource_name]['details'].append({
                    'date': usage_date,
                    'meter': meter_name,
                    'quantity': quantity,
                    'cost': cost
                })
            
            print(f"总成本: ${total_cost:.2f}")
            print(f"平均日成本: ${total_cost/30:.2f}")
            print()
            
            # 按资源显示详情
            for resource_name, resource_data in resources.items():
                print(f"资源: {resource_name}")
                print(f"总费用: ${resource_data['total_cost']:.2f}")
                print("详细使用:")
                
                for detail in resource_data['details']:
                    if detail['cost'] > 0:  # 只显示有费用的记录
                        print(f"  日期: {detail['date']}")
                        print(f"  计量器: {detail['meter']}")
                        print(f"  用量: {detail['quantity']}")
                        print(f"  费用: ${detail['cost']:.2f}")
                        print("  " + "-" * 30)
                
                print("=" * 50)
            
            return data
        else:
            print("没有找到成本数据")
            return None
    else:
        print(f"查询失败: {response.status_code} - {response.text}")
        return None

def load_azure_credentials(credentials_file="azure_credentials.json"):
    """从JSON文件加载Azure凭据"""
    try:
        with open(credentials_file, 'r', encoding='utf-8') as f:
            azure_credentials = json.load(f)
        
        # 验证必需的字段
        required_fields = ["appId", "password", "tenant"]
        for field in required_fields:
            if field not in azure_credentials:
                raise ValueError(f"缺少必需字段: {field}")
        
        print(f"✅ 成功从 {credentials_file} 加载Azure凭据")
        return azure_credentials
    
    except FileNotFoundError:
        print(f"❌ 未找到凭据文件: {credentials_file}")
        print("请创建包含以下格式的JSON文件:")
        print(json.dumps({
            "appId": "your-app-id",
            "displayName": "your-app-display-name",
            "password": "your-app-password",
            "tenant": "your-tenant-id"
        }, indent=2))
        return None
    
    except json.JSONDecodeError as e:
        print(f"❌ JSON文件格式错误: {e}")
        return None
    
    except ValueError as e:
        print(f"❌ 凭据文件内容错误: {e}")
        return None

def main(credentials_file="azure_credentials.json"):
    """主函数 - 自动获取订阅并查询Speech服务成本"""
    # 获取并显示当前查询时间
    query_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"📄 查询时间: {query_time}")
    print("=" * 80)

    # 从外部JSON文件加载Azure凭据
    azure_credentials = load_azure_credentials(credentials_file)
    if not azure_credentials:
        print("❌ 无法加载Azure凭据，程序退出")
        return
    
    # 解析凭据格式：appId->client_id, tenant->tenant_id, password->client_secret
    credentials = {
        "tenant_id": azure_credentials["tenant"],
        "client_id": azure_credentials["appId"],
        "client_secret": azure_credentials["password"]
    }
    
    print(f"🔑 使用Azure凭据: {azure_credentials['displayName']}")
    print(f"   Client ID: {credentials['client_id']}")
    print(f"   Tenant ID: {credentials['tenant_id']}")
    
    print("🚀 开始Azure Speech服务成本查询...")
    print("=" * 80)
    
    # 1. 获取访问令牌
    print("\n1️⃣ 获取访问令牌...")
    access_token = get_access_token(
        credentials["tenant_id"],
        credentials["client_id"],
        credentials["client_secret"]
    )
    
    if not access_token:
        print("❌ 无法获取访问令牌，程序退出")
        return
    
    # 2. 获取订阅列表
    print("\n2️⃣ 获取订阅列表...")
    subscriptions = get_subscriptions(access_token)
    
    if not subscriptions:
        print("❌ 无法获取订阅列表，程序退出")
        return
    
    # 3. 对每个订阅查询Speech服务成本
    print(f"\n3️⃣ 开始查询 {len(subscriptions)} 个订阅的Speech服务成本...")
    
    all_results = {}
    
    for i, subscription in enumerate(subscriptions, 1):
        subscription_id = subscription.get('subscriptionId')
        display_name = subscription.get('displayName', 'Unknown')
        
        print(f"\n📊 正在查询订阅 {i}/{len(subscriptions)}: {display_name}")
        print(f"订阅ID: {subscription_id}")
        print("-" * 60)
        
        result = get_speech_service_costs(
            credentials["tenant_id"],
            credentials["client_id"],
            credentials["client_secret"],
            subscription_id
        )
        
        if result:
            all_results[subscription_id] = {
                'subscription_name': display_name,
                'subscription_id': subscription_id,
                'cost_data': result
            }
            
            # 为每个订阅保存单独的文件
            # 根据运行环境选择正确的路径
            uploads_dir = '/app/uploads' if os.path.exists('/app') else 'uploads'
            filename = f'{uploads_dir}/speech_service_costs_{subscription_id[:8]}.json'
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(result, f, indent=2, ensure_ascii=False)
            print(f"✅ 订阅 {display_name} 的数据已保存到 {filename}")
        else:
            print(f"❌ 订阅 {display_name} 查询失败")
    
    # 4. 保存汇总结果
    if all_results:
        # 根据运行环境选择正确的路径
        uploads_dir = '/app/uploads' if os.path.exists('/app') else 'uploads'
        summary_filename = f'{uploads_dir}/speech_service_costs_summary.json'
        with open(summary_filename, 'w', encoding='utf-8') as f:
            json.dump(all_results, f, indent=2, ensure_ascii=False)
        
        print(f"\n🎉 查询完成!")
        print(f"✅ 成功查询了 {len(all_results)} 个订阅的Speech服务成本")
        print(f"✅ 汇总数据已保存到 {summary_filename}")
        print(f"✅ 各订阅详细数据已分别保存到对应文件")
        
        # 显示汇总统计
        print(f"\n📈 汇总统计:")
        print("=" * 60)
        total_subscriptions_with_costs = 0
        for sub_id, data in all_results.items():
            cost_data = data['cost_data']
            if 'properties' in cost_data and 'rows' in cost_data['properties']:
                rows = cost_data['properties']['rows']
                if rows:
                    total_subscriptions_with_costs += 1
                    print(f"  {data['subscription_name']}: 有成本数据")
                else:
                    print(f"  {data['subscription_name']}: 无成本数据")
            else:
                print(f"  {data['subscription_name']}: 无成本数据")
        
        print(f"\n有Speech服务成本的订阅数: {total_subscriptions_with_costs}/{len(all_results)}")
    else:
        print("\n❌ 没有成功查询到任何订阅的数据")

# 使用示例
if __name__ == "__main__":
    import sys
    import argparse

    # 处理帮助信息 - 在argparse之前处理
    if len(sys.argv) > 1 and sys.argv[1] in ['--help', '-h', 'help']:
        print("🔧 Azure账单查询工具使用说明")
        print("=" * 50)
        print("用法: python az.py [凭据文件路径]")
        print("")
        print("参数:")
        print("  凭据文件路径    Azure凭据JSON文件路径 (可选，默认: azure_credentials.json)")
        print("")
        print("凭据文件格式:")
        print('{')
        print('  "appId": "your-app-id",')
        print('  "displayName": "your-app-display-name",')
        print('  "password": "your-app-password",')
        print('  "tenant": "your-tenant-id"')
        print('}')
        print("")
        print("示例:")
        print("  python az.py                           # 使用默认凭据文件")
        print("  python az.py my_credentials.json       # 使用指定凭据文件")
        sys.exit(0)

    # 创建命令行参数解析器
    parser = argparse.ArgumentParser(description='Azure账单查询工具', add_help=False)
    parser.add_argument('credentials_file', nargs='?', default='azure_credentials.json',
                       help='Azure凭据文件路径 (默认: azure_credentials.json)')

    args = parser.parse_args()
    credentials_file = args.credentials_file

    print(f"🔧 使用指定的凭据文件: {credentials_file}")
    if credentials_file == "azure_credentials.json":
        print(f"💡 提示: 可以通过命令行参数指定其他文件，例如: python az.py my_credentials.json")
    
    main(credentials_file)