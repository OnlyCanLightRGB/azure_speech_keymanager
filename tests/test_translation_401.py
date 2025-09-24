#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
翻译密钥401状态码测试脚本
多次调用翻译API，观察是否会返回401状态码
"""

import os
import json
import requests
import time
import threading
from datetime import datetime
import traceback

# 配置
KEY_MANAGER_BASE_URL = "http://localhost:3019/api"
TRANSLATION_TEXT = "Hello, how are you today?"
TRANSLATION_FROM = "en"
TRANSLATION_TO = "zh"
TEST_ITERATIONS = 50  # 测试次数
DELAY_BETWEEN_REQUESTS = 0.1  # 请求间隔（秒）

class AzureTranslationKeyManager:
    """Azure翻译密钥管理器"""
    
    def __init__(self, base_url=KEY_MANAGER_BASE_URL):
        self.base_url = base_url
        self.current_key = None
        self._lock = threading.Lock()

    def get_key(self, region='eastasia'):
        """获取翻译密钥"""
        try:
            response = requests.get(f"{self.base_url}/translation/keys/get", 
                                  params={'region': region}, 
                                  timeout=10)
            if response.status_code == 200:
                result = response.json()
                if result.get('success'):
                    return result
                else:
                    print(f"获取密钥失败: {result.get('error', '未知错误')}")
                    return None
            else:
                print(f"HTTP错误: {response.status_code}")
                return None
        except Exception as e:
            print(f"获取密钥异常: {e}")
            return None

    def report_status(self, key, status_code, note=''):
        """报告密钥状态"""
        try:
            data = {
                'key': key,
                'status_code': status_code,
                'note': note
            }
            response = requests.post(f"{self.base_url}/translation/keys/status", 
                                   json=data, 
                                   timeout=10)
            return response.json() if response.status_code == 200 else None
        except Exception as e:
            print(f"报告状态异常: {e}")
            return None

    @classmethod
    def get_azure_key_with_retry(cls, region='eastasia', max_retries=3):
        """带重试的获取Azure密钥"""
        manager = cls()
        for attempt in range(max_retries):
            result = manager.get_key(region)
            if result and result.get('success'):
                return result.get('data')
            time.sleep(1)
        return None

    def report_key_status_safe(self, key, status_code, note=''):
        """安全地报告密钥状态"""
        try:
            return self.report_status(key, status_code, note)
        except Exception as e:
            print(f"报告密钥状态失败: {e}")
            return None

def get_key_abbreviation(key):
    """获取密钥缩写"""
    if not key:
        return "None"
    return f"{key[:8]}...{key[-4:]}" if len(key) > 12 else key

def test_translation_api_single():
    """单次翻译API测试"""
    start_time = time.time()
    success = False
    error_msg = ""
    status_code = None
    response_text = ""
    azure_key_info = None
    
    try:
        # 获取Azure翻译密钥
        azure_key_info = AzureTranslationKeyManager.get_azure_key_with_retry()
        if not azure_key_info:
            return {
                'success': False,
                'error': '无法获取可用的Azure翻译密钥',
                'status_code': None,
                'duration': time.time() - start_time,
                'key': None
            }

        azure_key = azure_key_info['key']
        azure_region = azure_key_info['region']
        key_abbr = get_key_abbreviation(azure_key)

        # 构建请求URL - 使用正确的全局端点
        endpoint = "https://api.cognitive.microsofttranslator.com/translate"
        params = {
            'api-version': '3.0',
            'from': TRANSLATION_FROM,
            'to': TRANSLATION_TO
        }
        headers = {
            'Ocp-Apim-Subscription-Key': azure_key,
            'Ocp-Apim-Subscription-Region': azure_region,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }

        # 准备请求数据
        request_data = [{'text': TRANSLATION_TEXT}]

        # 发送请求
        response = requests.post(endpoint, params=params, headers=headers, 
                               json=request_data, timeout=30)
        
        status_code = response.status_code
        response_text = response.text[:200] if response.text else ""

        if status_code == 401:
            error_msg = f"密钥无效 (401) - {response_text}"
            success = False
        elif status_code == 429:
            error_msg = f"请求过多 (429) - {response_text}"
            success = False
        elif status_code == 403:
            error_msg = f"访问被拒绝 (403) - {response_text}"
            success = False
        elif 200 <= status_code < 300:
            try:
                result_data = response.json()
                if result_data and isinstance(result_data, list) and len(result_data) > 0:
                    first_result = result_data[0]
                    if 'translations' in first_result and len(first_result['translations']) > 0:
                        translated_text = first_result['translations'][0]['text']
                        success = True
                        error_msg = f"翻译成功: '{TRANSLATION_TEXT}' -> '{translated_text}'"
                    else:
                        success = False
                        error_msg = f"翻译响应格式异常: 未找到translations"
                else:
                    success = False
                    error_msg = f"翻译响应格式异常: {str(result_data)[:100]}"
            except json.JSONDecodeError:
                success = False
                error_msg = f"JSON解析失败: {response_text}"
        else:
            error_msg = f"HTTP错误 ({status_code}) - {response_text}"
            success = False

        # 报告密钥状态
        if azure_key_info:
            translation_key_manager = AzureTranslationKeyManager()
            translation_key_manager.report_key_status_safe(azure_key, status_code, error_msg[:100])

        return {
            'success': success,
            'error': error_msg,
            'status_code': status_code,
            'duration': time.time() - start_time,
            'key': key_abbr,
            'response_text': response_text
        }

    except requests.exceptions.Timeout:
        error_msg = "请求超时"
        if azure_key_info:
            translation_key_manager = AzureTranslationKeyManager()
            translation_key_manager.report_key_status_safe(azure_key_info['key'], 408, "Request timeout")
    except requests.exceptions.RequestException as e:
        error_msg = f"请求异常: {e}"
        if azure_key_info and hasattr(e, 'response') and e.response:
            status_code = e.response.status_code
            translation_key_manager = AzureTranslationKeyManager()
            translation_key_manager.report_key_status_safe(azure_key_info['key'], status_code, f"Request exception: {str(e)[:100]}")
    except Exception as e:
        error_msg = f"意外错误: {e}"
        if azure_key_info:
            translation_key_manager = AzureTranslationKeyManager()
            translation_key_manager.report_key_status_safe(azure_key_info['key'], 500, f"Unexpected error: {str(e)[:100]}")

    return {
        'success': False,
        'error': error_msg,
        'status_code': status_code,
        'duration': time.time() - start_time,
        'key': get_key_abbreviation(azure_key_info['key']) if azure_key_info else None,
        'response_text': response_text
    }

def main():
    """主测试函数"""
    print("=" * 60)
    print("翻译密钥401状态码测试")
    print("=" * 60)
    print(f"测试次数: {TEST_ITERATIONS}")
    print(f"请求间隔: {DELAY_BETWEEN_REQUESTS}秒")
    print(f"测试文本: '{TRANSLATION_TEXT}'")
    print(f"翻译方向: {TRANSLATION_FROM} -> {TRANSLATION_TO}")
    print("-" * 60)

    # 统计变量
    total_requests = 0
    successful_requests = 0
    failed_requests = 0
    status_code_counts = {}
    error_types = {}
    
    # 开始测试
    start_time = time.time()
    
    for i in range(TEST_ITERATIONS):
        print(f"\n[{i+1}/{TEST_ITERATIONS}] 测试进行中...")
        
        result = test_translation_api_single()
        total_requests += 1
        
        if result['success']:
            successful_requests += 1
            print(f"✓ 成功: {result['error']}")
        else:
            failed_requests += 1
            print(f"✗ 失败: {result['error']}")
        
        # 统计状态码
        status_code = result['status_code']
        if status_code:
            status_code_counts[status_code] = status_code_counts.get(status_code, 0) + 1
        
        # 统计错误类型
        if not result['success']:
            error_key = f"{status_code}" if status_code else "Unknown"
            error_types[error_key] = error_types.get(error_key, 0) + 1
        
        print(f"   密钥: {result['key']}")
        print(f"   状态码: {status_code}")
        print(f"   耗时: {result['duration']:.3f}秒")
        
        # 特别关注401状态码
        if status_code == 401:
            print(f"   ⚠️  发现401状态码! 响应: {result['response_text']}")
        
        # 延迟
        if i < TEST_ITERATIONS - 1:
            time.sleep(DELAY_BETWEEN_REQUESTS)
    
    # 测试结束，输出统计结果
    end_time = time.time()
    total_duration = end_time - start_time
    
    print("\n" + "=" * 60)
    print("测试结果统计")
    print("=" * 60)
    print(f"总请求数: {total_requests}")
    print(f"成功请求: {successful_requests}")
    print(f"失败请求: {failed_requests}")
    print(f"成功率: {(successful_requests/total_requests*100):.1f}%")
    print(f"总耗时: {total_duration:.2f}秒")
    print(f"平均耗时: {(total_duration/total_requests):.3f}秒/请求")
    
    print(f"\n状态码分布:")
    for status_code, count in sorted(status_code_counts.items()):
        percentage = (count/total_requests*100)
        print(f"  {status_code}: {count}次 ({percentage:.1f}%)")
        if status_code == 401:
            print(f"    ⚠️  发现{count}次401状态码!")
    
    print(f"\n错误类型分布:")
    for error_type, count in sorted(error_types.items()):
        percentage = (count/failed_requests*100) if failed_requests > 0 else 0
        print(f"  {error_type}: {count}次 ({percentage:.1f}%)")
    
    # 401状态码特别提醒
    if 401 in status_code_counts:
        print(f"\n🚨 重要发现: 检测到 {status_code_counts[401]} 次401状态码!")
        print("   这表明翻译密钥确实会返回401无效状态。")
    else:
        print(f"\n✅ 未检测到401状态码")
        print("   在本次测试中，所有密钥都未返回401状态。")

if __name__ == "__main__":
    main()