#!/usr/bin/env python3
"""
超高强度翻译测试脚本 - 基于Azure官方文档触发429错误
根据官方文档：F0免费层限制为每分钟33,300字符（滑动窗口）
策略：在极短时间内发送大量字符以触发滑动窗口限制
"""

import requests
import json
import time
import threading
import concurrent.futures
from datetime import datetime
import uuid

# 配置参数 - 基于Azure官方文档的限制
KEY_MANAGER_BASE_URL = "http://localhost:3019/api"

# Azure翻译服务F0层限制（官方文档）:
# - 每小时200万字符
# - 每分钟约33,300字符（滑动窗口）
# - 每个请求最多50,000字符
# - 无并发请求限制

# 超激进测试策略：在30秒内发送100,000+字符以触发滑动窗口限制
CHARACTERS_PER_MINUTE_LIMIT = 33300  # F0层每分钟字符限制
TEST_TEXT_LENGTH = 5000  # 每个请求的字符数（增加到5000）
REQUESTS_TO_SEND = 25  # 发送25个请求 = 125,000字符
MAX_WORKERS = 25  # 高并发数
TEST_DURATION = 30  # 在30秒内完成所有请求

# 生成指定长度的测试文本
TEST_TEXT_BASE = "This is an extremely comprehensive and detailed test for Azure Translation service rate limiting mechanism designed to trigger the sliding window character limit. We need to send a large amount of text to exceed the 33,300 characters per minute limit as specified in the official Azure documentation. "
TEST_TEXT = (TEST_TEXT_BASE * (TEST_TEXT_LENGTH // len(TEST_TEXT_BASE) + 1))[:TEST_TEXT_LENGTH]

class UltraHighIntensityTranslationTester:
    def __init__(self):
        self.success_count = 0
        self.error_count = 0
        self.rate_limit_count = 0
        self.total_characters_sent = 0
        self.lock = threading.Lock()
        self.translation_key = None
        self.region = None
        self.start_time = None
        
    def get_translation_key(self):
        """获取翻译密钥"""
        try:
            response = requests.get(f'{KEY_MANAGER_BASE_URL}/translation/keys/get?region=eastasia&maxConcurrentRequests=50', timeout=10)
            result = response.json()
            if result.get('success'):
                data = result.get('data', {})
                self.translation_key = data.get('key')
                self.region = data.get('region', 'eastasia')
                print(f"获取到翻译密钥: {self.translation_key[:10]}... (区域: {self.region})")
                return True
            else:
                print(f"获取翻译密钥失败: {result.get('message')}")
                return False
        except Exception as e:
            print(f"获取翻译密钥异常: {e}")
            return False
    
    def report_key_status(self, status_code, note=''):
        """报告密钥状态"""
        try:
            data = {'key': self.translation_key, 'code': status_code, 'note': note}
            response = requests.post(f'{KEY_MANAGER_BASE_URL}/translation/keys/status', json=data, timeout=10)
            result = response.json()
            if status_code == 429:
                elapsed = time.time() - self.start_time
                print(f"✓ 成功报告429状态 (耗时{elapsed:.1f}秒): {result}")
            return result
        except Exception as e:
            print(f"报告状态失败: {e}")
            return None
    
    def make_translation_request(self, request_id, text):
        """发送单个翻译请求"""
        try:
            endpoint = "https://api.cognitive.microsofttranslator.com/translate"
            params = {
                'api-version': '3.0',
                'from': 'en',
                'to': 'zh-Hans'
            }
            headers = {
                'Ocp-Apim-Subscription-Key': self.translation_key,
                'Ocp-Apim-Subscription-Region': self.region,
                'Content-Type': 'application/json',
                'X-ClientTraceId': request_id
            }
            
            request_data = [{'text': text}]
            character_count = len(text)
            
            response = requests.post(
                endpoint, 
                params=params, 
                headers=headers, 
                json=request_data, 
                timeout=30
            )
            
            status_code = response.status_code
            elapsed = time.time() - self.start_time
            
            with self.lock:
                self.total_characters_sent += character_count
                
                if status_code == 429:
                    self.rate_limit_count += 1
                    print(f"🚨 触发429限制! (耗时{elapsed:.1f}秒, 请求ID: {request_id})")
                    print(f"   字符数: {character_count:,}, 总字符: {self.total_characters_sent:,}, 429次数: {self.rate_limit_count}")
                    print(f"   字符发送速率: {self.total_characters_sent/elapsed:.0f} 字符/秒")
                    # 立即报告429状态
                    self.report_key_status(429, f"Character limit exceeded - {character_count} chars - Total: {self.total_characters_sent} - Request {request_id}")
                elif 200 <= status_code < 300:
                    self.success_count += 1
                    if self.success_count % 5 == 0:
                        print(f"✓ 成功请求: {self.success_count}, 总字符: {self.total_characters_sent:,}, 速率: {self.total_characters_sent/elapsed:.0f} 字符/秒")
                else:
                    self.error_count += 1
                    print(f"❌ 错误状态码 {status_code} (耗时{elapsed:.1f}秒, 请求ID: {request_id}, 字符数: {character_count:,})")
                    if status_code in [401, 403, 404]:
                        self.report_key_status(status_code, f"Error {status_code} - {character_count} chars - Request {request_id}")
            
            return status_code
            
        except Exception as e:
            with self.lock:
                self.error_count += 1
            elapsed = time.time() - self.start_time
            print(f"❌ 请求异常 (耗时{elapsed:.1f}秒, ID: {request_id}): {e}")
            return None
    
    def run_ultra_high_intensity_test(self):
        """运行超高强度测试"""
        print("="*90)
        print("🚀 开始超高强度字符限制测试 - 基于Azure官方文档")
        print(f"📊 F0层限制: 每分钟{CHARACTERS_PER_MINUTE_LIMIT:,}字符（滑动窗口）")
        print(f"📊 测试配置: 每请求{TEST_TEXT_LENGTH:,}字符, 发送{REQUESTS_TO_SEND}个请求")
        print(f"📊 预计总字符: {REQUESTS_TO_SEND * TEST_TEXT_LENGTH:,}字符")
        print(f"📊 超过限制: {((REQUESTS_TO_SEND * TEST_TEXT_LENGTH) - CHARACTERS_PER_MINUTE_LIMIT):,}字符 ({((REQUESTS_TO_SEND * TEST_TEXT_LENGTH) / CHARACTERS_PER_MINUTE_LIMIT):.1f}倍)")
        print(f"📊 目标时间: {TEST_DURATION}秒内完成")
        print("="*90)
        
        if not self.get_translation_key():
            print("❌ 无法获取翻译密钥，测试终止")
            return
        
        self.start_time = time.time()
        
        # 超高强度并发发送请求
        with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = []
            
            print(f"🚀 开始发送 {REQUESTS_TO_SEND} 个并发请求...")
            
            # 立即提交所有请求
            for i in range(REQUESTS_TO_SEND):
                request_id = f"UltraHigh-{i}-{uuid.uuid4()}"
                future = executor.submit(self.make_translation_request, request_id, TEST_TEXT)
                futures.append(future)
            
            print(f"📤 已提交所有 {REQUESTS_TO_SEND} 个请求，等待结果...")
            
            # 等待所有请求完成，但有超时限制
            try:
                completed_futures = concurrent.futures.as_completed(futures, timeout=TEST_DURATION + 30)
                
                completed_count = 0
                for future in completed_futures:
                    try:
                        future.result()
                        completed_count += 1
                        
                        # 如果触发了429，继续等待其他请求完成
                        if self.rate_limit_count > 0 and completed_count >= 10:
                            elapsed = time.time() - self.start_time
                            print(f"🎯 已触发429限制，继续等待剩余请求完成... (已完成{completed_count}/{REQUESTS_TO_SEND})")
                            
                    except Exception as e:
                        print(f"❌ 请求处理异常: {e}")
                        
            except concurrent.futures.TimeoutError:
                print(f"⏰ 请求超时，取消剩余请求...")
                for future in futures:
                    future.cancel()
        
        # 输出最终统计
        end_time = time.time()
        duration = end_time - self.start_time
        
        print("\n" + "="*90)
        print("📊 测试结果统计")
        print("="*90)
        print(f"⏱️  测试持续时间: {duration:.2f} 秒")
        print(f"📤 总请求数: {self.success_count + self.error_count + self.rate_limit_count}")
        print(f"📝 总字符数: {self.total_characters_sent:,}")
        print(f"✅ 成功请求: {self.success_count}")
        print(f"🚨 429限制触发: {self.rate_limit_count}")
        print(f"❌ 其他错误: {self.error_count}")
        print(f"📈 字符发送速率: {self.total_characters_sent/duration:.0f} 字符/秒")
        print(f"📈 等效每分钟字符数: {(self.total_characters_sent/duration)*60:.0f} 字符/分钟")
        
        if self.rate_limit_count > 0:
            print(f"\n🎉 成功! 翻译服务已触发 {self.rate_limit_count} 次429限制")
            print(f"💡 触发限制时总字符数: {self.total_characters_sent:,}")
            print(f"💡 Azure F0层每分钟限制: {CHARACTERS_PER_MINUTE_LIMIT:,} 字符")
            print(f"💡 实际触发阈值: {self.total_characters_sent:,} 字符 (约{duration:.1f}秒内)")
            print("💡 现在可以检查管理页面，应该能看到翻译密钥进入冷却状态")
        else:
            print("\n⚠️  仍未触发429限制")
            print(f"💡 发送了 {self.total_characters_sent:,} 字符，速率 {(self.total_characters_sent/duration)*60:.0f} 字符/分钟")
            print(f"💡 Azure限制: {CHARACTERS_PER_MINUTE_LIMIT:,} 字符/分钟")
            if (self.total_characters_sent/duration)*60 > CHARACTERS_PER_MINUTE_LIMIT:
                print("💡 理论上应该触发限制，可能滑动窗口机制与预期不同")
            else:
                print("💡 需要进一步增加字符发送速率")

if __name__ == "__main__":
    tester = UltraHighIntensityTranslationTester()
    tester.run_ultra_high_intensity_test()