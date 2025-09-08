#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
添加测试翻译密钥脚本
"""

import requests
import json

def add_test_translation_key(base_url="http://localhost:3000"):
    """添加一个测试用的翻译密钥"""
    
    # 测试用的翻译密钥数据
    test_key_data = {
        "key": "test_translation_key_12345678901234567890",  # 测试用密钥
        "region": "global",
        "keyname": "TestTranslationKey-ConcurrencyTest"
    }
    
    try:
        print(f"正在添加测试翻译密钥到 {base_url}...")
        
        # 发送POST请求添加密钥
        response = requests.post(
            f"{base_url}/api/translation/keys",
            json=test_key_data,
            timeout=10
        )
        
        print(f"响应状态码: {response.status_code}")
        
        if response.status_code == 201:
            result = response.json()
            print("✅ 测试翻译密钥添加成功!")
            print(f"密钥信息: {json.dumps(result, indent=2, ensure_ascii=False)}")
            return True
        elif response.status_code == 500:
            result = response.json()
            if "already exists" in result.get('error', ''):
                print("ℹ️  测试翻译密钥已存在，可以直接使用")
                return True
            else:
                print(f"❌ 添加失败: {result.get('error', 'Unknown error')}")
                return False
        else:
            try:
                result = response.json()
                print(f"❌ 添加失败: {result.get('error', 'Unknown error')}")
            except:
                print(f"❌ 添加失败: HTTP {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ 请求失败: {e}")
        return False

def get_translation_keys(base_url="http://localhost:3000"):
    """获取当前的翻译密钥列表"""
    try:
        print(f"\n正在获取翻译密钥列表...")
        
        response = requests.get(
            f"{base_url}/api/translation/keys",
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            keys = result.get('data', [])
            print(f"✅ 找到 {len(keys)} 个翻译密钥:")
            for key in keys:
                print(f"  - ID: {key.get('id')}, 区域: {key.get('region')}, 状态: {key.get('status')}, 名称: {key.get('keyname')}")
            return keys
        else:
            print(f"❌ 获取密钥列表失败: HTTP {response.status_code}")
            return []
            
    except Exception as e:
        print(f"❌ 获取密钥列表失败: {e}")
        return []

if __name__ == "__main__":
    print("=== 翻译密钥管理工具 ===")
    
    # 先查看现有密钥
    existing_keys = get_translation_keys()
    
    # 如果没有密钥，则添加测试密钥
    if not existing_keys:
        print("\n没有找到现有的翻译密钥，正在添加测试密钥...")
        success = add_test_translation_key()
        if success:
            print("\n重新获取密钥列表...")
            get_translation_keys()
    else:
        print("\n已有翻译密钥，可以直接进行测试")
    
    print("\n=== 完成 ===")