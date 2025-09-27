#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试401错误触发飞书通知的脚本
"""

import requests
import json
import time

def test_401_error():
    """模拟401错误来测试飞书通知"""
    
    # 使用一个无效的密钥来触发401错误
    invalid_key = "invalid_test_key_12345"
    
    # 正确的API端点 - 使用TTS测试 (端口3000)
    url = "http://localhost:3000/api/keys/test"
    
    # 请求数据
    data = {
        "key": invalid_key,
        "region": "eastus",
        "text": "测试飞书通知"
    }
    
    headers = {
        "Content-Type": "application/json"
    }
    
    print("🧪 开始测试401错误触发飞书通知...")
    print(f"使用无效密钥: {invalid_key}")
    print(f"请求URL: {url}")
    
    try:
        # 发送请求
        response = requests.post(url, json=data, headers=headers, timeout=30)
        
        print(f"响应状态码: {response.status_code}")
        print(f"响应内容: {response.text}")
        
        if response.status_code == 401 or (response.status_code == 200 and "401" in response.text):
            print("✅ 成功触发401错误！")
            print("📱 请检查飞书群是否收到通知...")
            return True
        else:
            print(f"❌ 未触发401错误，状态码: {response.status_code}")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"❌ 请求失败: {e}")
        return False

def test_with_existing_key():
    """使用现有密钥但故意让其失效来测试"""
    
    # 首先获取现有的密钥
    try:
        response = requests.get("http://localhost:3000/api/keys")
        if response.status_code == 200:
            result = response.json()
            if result.get('success') and result.get('data') and len(result['data']) > 0:
                # 使用第一个密钥，但修改它使其无效
                key_info = result['data'][0]
                invalid_key = key_info['key'] + "_invalid"
                
                print(f"🔑 使用修改后的密钥: {invalid_key[:8]}...")
                
                # 测试TTS API
                url = "http://localhost:3000/api/keys/test"
                data = {
                    "key": invalid_key,
                    "region": key_info['region'],
                    "text": "测试飞书通知"
                }
                
                response = requests.post(url, json=data, headers={"Content-Type": "application/json"}, timeout=30)
                print(f"响应状态码: {response.status_code}")
                print(f"响应内容: {response.text}")
                
                return response.status_code == 401 or (response.status_code == 200 and "401" in response.text)
            else:
                print("❌ 没有找到可用的密钥")
                return False
        else:
            print(f"❌ 获取密钥失败: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ 测试失败: {e}")
        return False

if __name__ == "__main__":
    print("=" * 50)
    print("🧪 Azure Speech Key Manager - 飞书通知测试")
    print("=" * 50)
    
    # 测试方法1：使用完全无效的密钥
    print("\n📋 测试方法1: 使用无效密钥")
    result1 = test_401_error()
    
    time.sleep(2)
    
    # 测试方法2：使用修改后的现有密钥
    print("\n📋 测试方法2: 使用修改后的现有密钥")
    result2 = test_with_existing_key()
    
    print("\n" + "=" * 50)
    print("📊 测试结果:")
    print(f"方法1 (无效密钥): {'✅ 成功' if result1 else '❌ 失败'}")
    print(f"方法2 (修改密钥): {'✅ 成功' if result2 else '❌ 失败'}")
    
    if result1 or result2:
        print("\n🎉 至少一个测试成功触发了401错误！")
        print("📱 请检查飞书群是否收到通知消息。")
        print("⏰ 通知可能需要几秒钟时间才能到达。")
    else:
        print("\n❌ 所有测试都未能触发401错误。")
        print("🔍 请检查API端点和密钥管理逻辑。")
    
    print("=" * 50)