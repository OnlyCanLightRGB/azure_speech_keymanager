#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
检查翻译密钥的具体内容和有效性
"""

import requests
import json
import mysql.connector
import os
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

def get_keys_from_api():
    """通过API获取翻译密钥列表"""
    try:
        response = requests.get("http://localhost:3000/api/translation/keys", timeout=10)
        if response.status_code == 200:
            result = response.json()
            return result.get('data', [])
        else:
            print(f"❌ API请求失败: HTTP {response.status_code}")
            return []
    except Exception as e:
        print(f"❌ API请求异常: {e}")
        return []

def get_keys_from_database():
    """直接从数据库获取翻译密钥"""
    try:
        # 数据库连接配置
        db_config = {
            'host': os.getenv('DB_HOST', 'localhost'),
            'port': int(os.getenv('DB_PORT', 3306)),
            'user': os.getenv('DB_USER', 'root'),
            'password': os.getenv('DB_PASSWORD', ''),
            'database': os.getenv('DB_NAME', 'azure_key_manager'),
            'charset': 'utf8mb4'
        }
        
        print(f"连接数据库: {db_config['host']}:{db_config['port']}/{db_config['database']}")
        
        connection = mysql.connector.connect(**db_config)
        cursor = connection.cursor(dictionary=True)
        
        # 查询翻译密钥
        cursor.execute("""
            SELECT id, `key`, region, keyname, status, created_at, updated_at
            FROM translation_keys 
            ORDER BY created_at DESC
        """)
        
        keys = cursor.fetchall()
        
        cursor.close()
        connection.close()
        
        return keys
        
    except Exception as e:
        print(f"❌ 数据库查询失败: {e}")
        return []

def test_azure_translation_key(key, region='eastasia'):
    """测试Azure翻译密钥是否有效"""
    try:
        endpoint = "https://api.cognitive.microsofttranslator.com/translate"
        params = {
            'api-version': '3.0',
            'from': 'en',
            'to': 'zh-Hans'
        }
        headers = {
            'Ocp-Apim-Subscription-Key': key,
            'Ocp-Apim-Subscription-Region': region,
            'Content-Type': 'application/json'
        }
        
        request_data = [{'text': 'Hello world'}]
        
        response = requests.post(
            endpoint, 
            params=params, 
            headers=headers, 
            json=request_data, 
            timeout=10
        )
        
        return {
            'status_code': response.status_code,
            'success': response.status_code == 200,
            'response': response.text[:200] if response.text else '',
            'error': None if response.status_code == 200 else f"HTTP {response.status_code}"
        }
        
    except Exception as e:
        return {
            'status_code': None,
            'success': False,
            'response': '',
            'error': str(e)
        }

def analyze_key_format(key):
    """分析密钥格式"""
    analysis = {
        'length': len(key),
        'format': 'unknown',
        'likely_valid': False
    }
    
    # Azure认知服务密钥通常是32字符的十六进制字符串
    if len(key) == 32 and all(c in '0123456789abcdefABCDEF' for c in key):
        analysis['format'] = 'Azure Cognitive Services (32-char hex)'
        analysis['likely_valid'] = True
    elif len(key) == 40 and key.startswith('test_'):
        analysis['format'] = 'Test key (40-char with test_ prefix)'
        analysis['likely_valid'] = False
    elif 'test' in key.lower():
        analysis['format'] = 'Test/Demo key'
        analysis['likely_valid'] = False
    elif len(key) < 20:
        analysis['format'] = 'Too short for Azure key'
        analysis['likely_valid'] = False
    else:
        analysis['format'] = 'Unknown format'
        analysis['likely_valid'] = False
    
    return analysis

def main():
    print("=" * 80)
    print("🔍 翻译密钥检查工具")
    print("=" * 80)
    
    # 1. 通过API获取密钥列表
    print("\n📋 通过API获取密钥列表:")
    api_keys = get_keys_from_api()
    if api_keys:
        for key in api_keys:
            print(f"  - ID: {key.get('id')}, 状态: {key.get('status')}, 名称: {key.get('keyname')}, 区域: {key.get('region')}")
    else:
        print("  ❌ 无法通过API获取密钥")
    
    # 2. 直接从数据库获取密钥
    print("\n🗄️  直接从数据库获取密钥:")
    db_keys = get_keys_from_database()
    if db_keys:
        print(f"  ✅ 找到 {len(db_keys)} 个密钥")
        
        for key_info in db_keys:
            key_id = key_info['id']
            key_value = key_info['key']
            keyname = key_info['keyname']
            status = key_info['status']
            region = key_info['region']
            
            print(f"\n🔑 密钥 #{key_id} ({keyname})")
            print(f"   状态: {status}")
            print(f"   区域: {region}")
            print(f"   完整密钥: {key_value}")
            
            # 分析密钥格式
            analysis = analyze_key_format(key_value)
            print(f"   长度: {analysis['length']} 字符")
            print(f"   格式: {analysis['format']}")
            print(f"   可能有效: {'是' if analysis['likely_valid'] else '否'}")
            
            # 如果密钥可能有效且状态为enabled，则测试
            if status == 'enabled' and analysis['likely_valid']:
                print(f"   🧪 测试密钥有效性...")
                test_result = test_azure_translation_key(key_value, region)
                if test_result['success']:
                    print(f"   ✅ 密钥有效! 状态码: {test_result['status_code']}")
                else:
                    print(f"   ❌ 密钥无效! 状态码: {test_result['status_code']}, 错误: {test_result['error']}")
                    print(f"   响应: {test_result['response']}")
            elif status == 'enabled':
                print(f"   ⚠️  密钥格式不像有效的Azure密钥，跳过测试")
            else:
                print(f"   ⏸️  密钥已禁用，跳过测试")
    else:
        print("  ❌ 无法从数据库获取密钥")
    
    print("\n" + "=" * 80)
    print("🎯 结论和建议:")
    print("=" * 80)
    
    if db_keys:
        enabled_keys = [k for k in db_keys if k['status'] == 'enabled']
        valid_format_keys = [k for k in enabled_keys if analyze_key_format(k['key'])['likely_valid']]
        
        print(f"📊 统计信息:")
        print(f"   总密钥数: {len(db_keys)}")
        print(f"   启用的密钥: {len(enabled_keys)}")
        print(f"   格式可能有效的启用密钥: {len(valid_format_keys)}")
        
        if len(valid_format_keys) == 0:
            print("\n❌ 问题诊断: 没有格式有效的启用密钥!")
            print("💡 建议:")
            print("   1. 检查现有密钥是否为真实的Azure翻译服务密钥")
            print("   2. 如果是测试密钥，请替换为真实的Azure API密钥")
            print("   3. Azure翻译服务密钥通常是32字符的十六进制字符串")
            print("   4. 可以在Azure门户的认知服务资源中找到真实密钥")
        else:
            print("\n✅ 密钥格式看起来正常")
            print("💡 如果仍然无法触发429限制，可能的原因:")
            print("   1. Azure免费层的限制比预期更宽松")
            print("   2. 滑动窗口机制的实现与文档描述不同")
            print("   3. 需要更高的并发或更大的字符量才能触发")
    
    print("\n=== 检查完成 ===")

if __name__ == "__main__":
    main()