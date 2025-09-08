#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
翻译服务并发限制测试脚本
测试新实现的翻译服务429限流功能
"""

import asyncio
import aiohttp
import time
import json
from typing import List, Dict, Any
import argparse
import csv
from datetime import datetime

class TranslationConcurrencyTester:
    def __init__(self, base_url: str = "http://localhost:3000"):
        self.base_url = base_url
        self.results = []
        self.stats = {
            'total_requests': 0,
            'successful_requests': 0,
            'failed_requests': 0,
            'rate_limited_requests': 0,
            'concurrent_limit_errors': 0,
            'other_errors': 0
        }
    
    async def get_translation_key(self, session: aiohttp.ClientSession, max_concurrent: int = 5) -> Dict[str, Any]:
        """获取翻译密钥，设置并发限制"""
        url = f"{self.base_url}/api/translation/keys/get"
        params = {
            'region': 'eastasia',
            'maxConcurrentRequests': max_concurrent
        }
        
        start_time = time.time()
        try:
            async with session.get(url, params=params) as response:
                end_time = time.time()
                response_time = (end_time - start_time) * 1000  # 转换为毫秒
                
                result = {
                    'timestamp': datetime.now().isoformat(),
                    'method': 'GET',
                    'url': url,
                    'status_code': response.status,
                    'response_time_ms': round(response_time, 2),
                    'success': response.status == 200
                }
                
                if response.status == 200:
                    data = await response.json()
                    result['key_data'] = data.get('data', {})
                    result['message'] = data.get('message', '')
                elif response.status == 429:
                    data = await response.json()
                    result['error'] = data.get('error', 'Too Many Requests')
                    result['message'] = data.get('message', '')
                else:
                    try:
                        data = await response.json()
                        result['error'] = data.get('error', f'HTTP {response.status}')
                    except:
                        result['error'] = f'HTTP {response.status}'
                
                return result
                
        except Exception as e:
            end_time = time.time()
            response_time = (end_time - start_time) * 1000
            return {
                'timestamp': datetime.now().isoformat(),
                'method': 'GET',
                'url': url,
                'status_code': 0,
                'response_time_ms': round(response_time, 2),
                'success': False,
                'error': str(e)
            }
    
    async def acquire_request_permit(self, session: aiohttp.ClientSession, key: str, max_concurrent: int = 5) -> Dict[str, Any]:
        """获取请求许可"""
        url = f"{self.base_url}/api/translation/keys/acquire-request"
        payload = {
            'key': key,
            'maxConcurrentRequests': max_concurrent,
            'requestTimeout': 30000
        }
        
        start_time = time.time()
        try:
            async with session.post(url, json=payload) as response:
                end_time = time.time()
                response_time = (end_time - start_time) * 1000
                
                result = {
                    'timestamp': datetime.now().isoformat(),
                    'method': 'POST',
                    'url': url,
                    'status_code': response.status,
                    'response_time_ms': round(response_time, 2),
                    'success': response.status == 200
                }
                
                if response.status == 200:
                    data = await response.json()
                    result['request_id'] = data.get('data', {}).get('requestId')
                    result['message'] = data.get('message', '')
                elif response.status == 429:
                    data = await response.json()
                    result['error'] = data.get('error', 'Too Many Requests')
                    result['message'] = data.get('message', '')
                else:
                    try:
                        data = await response.json()
                        result['error'] = data.get('error', f'HTTP {response.status}')
                    except:
                        result['error'] = f'HTTP {response.status}'
                
                return result
                
        except Exception as e:
            end_time = time.time()
            response_time = (end_time - start_time) * 1000
            return {
                'timestamp': datetime.now().isoformat(),
                'method': 'POST',
                'url': url,
                'status_code': 0,
                'response_time_ms': round(response_time, 2),
                'success': False,
                'error': str(e)
            }
    
    async def release_request_permit(self, session: aiohttp.ClientSession, key: str, request_id: str) -> Dict[str, Any]:
        """释放请求许可"""
        url = f"{self.base_url}/api/translation/keys/release-request"
        payload = {
            'key': key,
            'requestId': request_id
        }
        
        start_time = time.time()
        try:
            async with session.post(url, json=payload) as response:
                end_time = time.time()
                response_time = (end_time - start_time) * 1000
                
                result = {
                    'timestamp': datetime.now().isoformat(),
                    'method': 'POST',
                    'url': url,
                    'status_code': response.status,
                    'response_time_ms': round(response_time, 2),
                    'success': response.status == 200
                }
                
                if response.status == 200:
                    data = await response.json()
                    result['released'] = data.get('data', {}).get('released', False)
                    result['message'] = data.get('message', '')
                else:
                    try:
                        data = await response.json()
                        result['error'] = data.get('error', f'HTTP {response.status}')
                    except:
                        result['error'] = f'HTTP {response.status}'
                
                return result
                
        except Exception as e:
            end_time = time.time()
            response_time = (end_time - start_time) * 1000
            return {
                'timestamp': datetime.now().isoformat(),
                'method': 'POST',
                'url': url,
                'status_code': 0,
                'response_time_ms': round(response_time, 2),
                'success': False,
                'error': str(e)
            }
    
    async def get_stats(self, session: aiohttp.ClientSession) -> Dict[str, Any]:
        """获取统计信息"""
        url = f"{self.base_url}/api/translation/keys/stats"
        
        try:
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get('data', {})
                else:
                    return {}
        except Exception as e:
            print(f"获取统计信息失败: {e}")
            return {}
    
    async def simulate_concurrent_requests(self, session: aiohttp.ClientSession, key: str, 
                                         concurrent_count: int, max_concurrent: int, 
                                         hold_time: float = 2.0) -> List[Dict[str, Any]]:
        """模拟并发请求"""
        print(f"开始模拟 {concurrent_count} 个并发请求，最大并发限制: {max_concurrent}")
        
        async def single_request(request_num: int) -> Dict[str, Any]:
            # 获取请求许可
            acquire_result = await self.acquire_request_permit(session, key, max_concurrent)
            
            if acquire_result['success']:
                request_id = acquire_result.get('request_id')
                print(f"请求 {request_num}: 获取许可成功，request_id: {request_id}")
                
                # 模拟请求处理时间
                await asyncio.sleep(hold_time)
                
                # 释放请求许可
                release_result = await self.release_request_permit(session, key, request_id)
                print(f"请求 {request_num}: 释放许可，成功: {release_result['success']}")
                
                return {
                    'request_num': request_num,
                    'acquire': acquire_result,
                    'release': release_result
                }
            else:
                print(f"请求 {request_num}: 获取许可失败 - {acquire_result.get('error', 'Unknown error')}")
                return {
                    'request_num': request_num,
                    'acquire': acquire_result,
                    'release': None
                }
        
        # 并发执行所有请求
        tasks = [single_request(i) for i in range(1, concurrent_count + 1)]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        return [r for r in results if not isinstance(r, Exception)]
    
    async def test_concurrent_limit(self, max_concurrent: int = 5, concurrent_requests: int = 10, 
                                  hold_time: float = 2.0) -> None:
        """测试并发限制功能"""
        print(f"\n=== 翻译服务并发限制测试 ===")
        print(f"最大并发数: {max_concurrent}")
        print(f"测试并发请求数: {concurrent_requests}")
        print(f"请求持续时间: {hold_time}秒")
        print(f"基础URL: {self.base_url}")
        
        connector = aiohttp.TCPConnector(limit=100, limit_per_host=50)
        timeout = aiohttp.ClientTimeout(total=60)
        
        async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
            # 1. 获取翻译密钥
            print("\n1. 获取翻译密钥...")
            key_result = await self.get_translation_key(session, max_concurrent)
            
            if not key_result['success']:
                print(f"获取翻译密钥失败: {key_result.get('error', 'Unknown error')}")
                return
            
            key_data = key_result.get('key_data', {})
            key = key_data.get('key')
            if not key:
                print("未能获取到有效的翻译密钥")
                return
            
            print(f"成功获取翻译密钥: {key[:8]}...")
            
            # 2. 获取初始统计信息
            print("\n2. 获取初始统计信息...")
            initial_stats = await self.get_stats(session)
            print(f"初始并发统计: {initial_stats.get('concurrency', {})}")
            
            # 3. 执行并发测试
            print("\n3. 执行并发测试...")
            start_time = time.time()
            
            results = await self.simulate_concurrent_requests(
                session, key, concurrent_requests, max_concurrent, hold_time
            )
            
            end_time = time.time()
            total_time = end_time - start_time
            
            # 4. 分析结果
            print("\n4. 分析测试结果...")
            successful_acquires = sum(1 for r in results if r['acquire']['success'])
            failed_acquires = sum(1 for r in results if not r['acquire']['success'])
            rate_limited = sum(1 for r in results if r['acquire'].get('status_code') == 429)
            
            print(f"总请求数: {len(results)}")
            print(f"成功获取许可: {successful_acquires}")
            print(f"获取许可失败: {failed_acquires}")
            print(f"429限流错误: {rate_limited}")
            print(f"总耗时: {total_time:.2f}秒")
            
            # 5. 验证并发限制是否生效
            if rate_limited > 0:
                print(f"\n✅ 并发限制功能正常工作！检测到 {rate_limited} 个429限流响应")
            else:
                print(f"\n⚠️  未检测到429限流响应，可能需要增加并发数或减少最大并发限制")
            
            # 6. 获取最终统计信息
            print("\n5. 获取最终统计信息...")
            final_stats = await self.get_stats(session)
            print(f"最终并发统计: {final_stats.get('concurrency', {})}")
            
            # 7. 保存详细结果
            self.save_results_to_csv(results, f"translation_concurrency_test_{int(time.time())}.csv")
            
            return results
    
    def save_results_to_csv(self, results: List[Dict[str, Any]], filename: str) -> None:
        """保存结果到CSV文件"""
        if not results:
            return
        
        with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
            fieldnames = [
                'request_num', 'acquire_timestamp', 'acquire_status_code', 'acquire_success',
                'acquire_response_time_ms', 'acquire_error', 'request_id',
                'release_timestamp', 'release_status_code', 'release_success',
                'release_response_time_ms', 'release_error'
            ]
            
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()
            
            for result in results:
                acquire = result.get('acquire', {})
                release = result.get('release', {})
                
                row = {
                    'request_num': result.get('request_num'),
                    'acquire_timestamp': acquire.get('timestamp'),
                    'acquire_status_code': acquire.get('status_code'),
                    'acquire_success': acquire.get('success'),
                    'acquire_response_time_ms': acquire.get('response_time_ms'),
                    'acquire_error': acquire.get('error', ''),
                    'request_id': acquire.get('request_id', ''),
                    'release_timestamp': release.get('timestamp', '') if release else '',
                    'release_status_code': release.get('status_code', '') if release else '',
                    'release_success': release.get('success', '') if release else '',
                    'release_response_time_ms': release.get('response_time_ms', '') if release else '',
                    'release_error': release.get('error', '') if release else ''
                }
                
                writer.writerow(row)
        
        print(f"\n详细结果已保存到: {filename}")

async def main():
    parser = argparse.ArgumentParser(description='翻译服务并发限制测试')
    parser.add_argument('--url', default='http://localhost:3000', help='服务器URL')
    parser.add_argument('--max-concurrent', type=int, default=5, help='最大并发数限制')
    parser.add_argument('--concurrent-requests', type=int, default=10, help='测试并发请求数')
    parser.add_argument('--hold-time', type=float, default=2.0, help='请求持续时间（秒）')
    
    args = parser.parse_args()
    
    tester = TranslationConcurrencyTester(args.url)
    
    try:
        await tester.test_concurrent_limit(
            max_concurrent=args.max_concurrent,
            concurrent_requests=args.concurrent_requests,
            hold_time=args.hold_time
        )
    except KeyboardInterrupt:
        print("\n测试被用户中断")
    except Exception as e:
        print(f"\n测试过程中发生错误: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())