
# ##############################################################################
# Azure Translation 服务并发性能测试器 (RPM均匀发射版)
# ##############################################################################

import os
import json
import random
import requests
import uuid
import threading
import time
import csv
from datetime import datetime
import traceback
from queue import Queue, Empty
import math
import numpy as np
import io

# Azure Key Manager API配置
KEY_MANAGER_BASE_URL = "http://localhost:3019/api"

class AzureTranslationKeyManager:
    """Azure Translation Key Manager API客户端 - 支持翻译key管理"""

    # 类变量 - 存储当前可用的key
    current_key = None
    _update_thread = None
    _stop_update = False
    _lock = threading.Lock()
    _last_update_time = 0

    def __init__(self, base_url=KEY_MANAGER_BASE_URL):
        self.base_url = base_url
        self.proxies = {'http':None, 'https':None}

        # 启动定期更新线程（只启动一次）
        with AzureTranslationKeyManager._lock:
            if AzureTranslationKeyManager._update_thread is None:
                AzureTranslationKeyManager._stop_update = False
                AzureTranslationKeyManager._update_thread = threading.Thread(
                    target=self._update_key_periodically,
                    daemon=True,
                    name="TranslationKeyUpdater"
                )
                AzureTranslationKeyManager._update_thread.start()
                print("启动翻译密钥定期更新线程")

    def get_key(self, region='eastasia'):
        """获取可用的翻译密钥（原始API调用方法）"""
        try:
            response = requests.get(f'{self.base_url}/translation/keys/get', params={'region': region}, timeout=10, proxies=self.proxies)
            return response.json()
        except Exception as e:
            print(f"获取翻译密钥失败: {e}")
            return {'success': False, 'error': str(e)}

    def report_status(self, key, status_code, note=''):
        """报告翻译密钥使用状态"""
        try:
            data = {'key': key, 'code': status_code, 'note': note}
            response = requests.post(f'{self.base_url}/translation/keys/status', json=data, timeout=10, proxies=self.proxies)
            return response.json()
        except Exception as e:
            print(f"报告翻译密钥状态失败: {e}")
            return {'success': False, 'error': str(e)}

    def _update_key_periodically(self):
        """定期更新翻译密钥的后台线程"""
        while not AzureTranslationKeyManager._stop_update:
            try:
                # 获取新的密钥
                result = self.get_key('eastasia')
                current_time = time.time()

                if result.get('success') and result.get('data'):
                    with AzureTranslationKeyManager._lock:
                        old_key = AzureTranslationKeyManager.current_key
                        AzureTranslationKeyManager.current_key = result['data']
                        AzureTranslationKeyManager._last_update_time = current_time

                        # 只在密钥变化时打印日志
                        new_key_abbr = get_key_abbreviation(AzureTranslationKeyManager.current_key.get('key', ''))
                        if old_key is None:
                            print(f"初始化全局翻译密钥: {new_key_abbr} | 区域: {AzureTranslationKeyManager.current_key.get('region', '')}")
                        elif old_key.get('key') != AzureTranslationKeyManager.current_key.get('key'):
                            old_key_abbr = get_key_abbreviation(old_key.get('key', ''))
                            print(f"全局翻译密钥更新: {old_key_abbr} -> {new_key_abbr} | 区域: {AzureTranslationKeyManager.current_key.get('region', '')}")
                else:
                    print(f"定期更新翻译密钥失败: {result}")

            except Exception as e:
                print(f"定期更新翻译密钥异常: {e}")

            # 等待0.5秒
            time.sleep(0.5)

    @classmethod
    def get_azure_key_with_retry(cls, region='eastasia', max_retries=3):
        """获取Azure翻译密钥，从类变量获取（支持重试）"""
        for attempt in range(max_retries):
            try:
                with cls._lock:
                    if cls.current_key is not None:
                        key_data = cls.current_key.copy()
                        key_abbr = get_key_abbreviation(key_data.get('key', ''))
                        # 减少日志输出，只在第一次尝试时打印
                        if attempt == 0:
                            print(f"获取全局翻译密钥成功: {key_abbr} | 区域: {key_data.get('region', '')}")
                        return key_data
                    else:
                        print(f"全局翻译密钥未初始化 (尝试 {attempt + 1}/{max_retries})")
                        if attempt < max_retries - 1:
                            time.sleep(1)  # 等待密钥初始化
            except Exception as e:
                print(f"获取全局翻译密钥异常 (尝试 {attempt + 1}/{max_retries}): {e}")
                if attempt < max_retries - 1:
                    time.sleep(1)
        return None

    def report_key_status_safe(self, key, status_code, note=''):
        """安全地报告翻译密钥状态，不抛出异常"""
        if status_code == 200:
            return {'success': True}
        key_abbr = get_key_abbreviation(key)
        try:
            result = self.report_status(key, status_code, note)
            if result and not result.get('success'):
                # print(f"报告翻译密钥状态失败 [{key_abbr}]: {result.get('error', '未知错误')}")
                pass
            else:
                print(f"报告翻译密钥状态成功 [{key_abbr}]: 状态码={status_code}, 备注={note}")
            return result
        except Exception as e:
            print(f"报告翻译密钥状态异常 [{key_abbr}]: {e}")
            return {'success': False, 'error': str(e)}

# 全局Translation Key Manager实例
translation_key_manager = AzureTranslationKeyManager()

def get_key_abbreviation(key):
    """生成密钥简写，用于日志显示"""
    if not key or len(key) < 8:
        return key
    return f"{key[:4]}...{key[-4:]}"

# 翻译测试参数
# 使用更长的文本来增加字符数消耗
TRANSLATION_TEXT = """Hello world, this is a comprehensive test for Azure Translation service. We are testing the translation capabilities with a longer text to consume more characters and potentially trigger rate limiting. This text contains multiple sentences and should help us reach the character limits faster. The Azure Translation service provides high-quality machine translation across multiple languages. We need to test various scenarios including high-volume requests, concurrent processing, and character consumption patterns. This extended text will help us evaluate the service's behavior under different load conditions and understand how rate limiting works in practice."""
TRANSLATION_FROM = "en"
TRANSLATION_TO = "zh-Hans"

# 测试配置
TARGET_RPM = 1000  # 目标每分钟请求数
TEST_DURATION_MINUTES = 1  # 测试持续时间（分钟）
# 保留旧参数以便向后兼容
TEST_DURATION_SECONDS = None  # 测试持续时间（秒）
TOTAL_REQUESTS = None  # 如果设置，将覆盖持续时间
MAX_WORKERS = 10  # 最大并发线程数（仅用于兼容，新框架不使用）

# 输出目录
CSV_OUTPUT_DIR = "../test_results"  # 保存到项目根目录的test_results文件夹
os.makedirs(CSV_OUTPUT_DIR, exist_ok=True)  # 确保输出目录存在

# 重试配置
MAX_RETRIES = 3  # 最大重试次数
RETRY_DELAY = 1  # 重试延迟（秒）

# --- 辅助类 ---
class AtomicCounter:
    """线程安全的计数器类"""
    def __init__(self, initial=0):
        self._value = initial
        self._lock = threading.Lock()

    def increment(self, num=1):
        """原子地增加计数器的值"""
        with self._lock:
            self._value += num
            return self._value

    @property
    def value(self):
        """获取计数器的当前值"""
        with self._lock:
            return self._value

# 创建适当的线程安全计数器
def create_counter(initial=0):
    """创建线程安全的计数器，优先使用内置的AtomicInt"""
    if hasattr(threading, 'AtomicInt'):
        return threading.AtomicInt(initial)
    return AtomicCounter(initial)

# --- 文字翻译API测试函数 ---
def test_text_translation_api(thread_id, result_list, proxies=None):
    """向文字翻译API发送请求并记录结果，支持密钥管理和容错"""
    start_time = time.time()
    time_to_first_chunk = None
    success = False
    error_msg = ""
    input_size = 0
    output_size = 0
    response = None
    request_id = f"TextTranslation-{thread_id}-{uuid.uuid4()}"
    translated_text = ""
    azure_key_info = None

    try:
        # 获取Azure翻译密钥
        azure_key_info = AzureTranslationKeyManager.get_azure_key_with_retry()
        if not azure_key_info:
            raise Exception("无法获取可用的Azure翻译密钥")

        azure_key = azure_key_info['key']
        azure_region = azure_key_info['region']
        key_abbr = get_key_abbreviation(azure_key)

        # 构建请求URL - 使用全局端点
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
            'X-ClientTraceId': request_id
        }

        # 准备请求数据
        request_data = [{'text': TRANSLATION_TEXT}]
        input_size = len(json.dumps(request_data))

        # 发送请求
        response = requests.post(endpoint, params=params, headers=headers, json=request_data, proxies=proxies, timeout=45)

        # 处理不同的HTTP状态码
        status_code = response.status_code

        if status_code == 429:
            # 请求过多，设置密钥为429状态
            error_msg = f"请求过多 (429) (ID: {request_id})"
            result_ = translation_key_manager.report_key_status_safe(azure_key, 429, "Rate limit exceeded")
            if result_ and result_.get('success'):
                print(f"文字翻译请求过多 (线程 {thread_id}, ID: {request_id}) [{key_abbr}]: 密钥已设置为429状态")
        elif status_code in [401, 403, 404]:
            # 密钥无效，设置为相应状态
            error_msg = f"密钥无效 ({status_code}) (ID: {request_id})"
            translation_key_manager.report_key_status_safe(azure_key, status_code, f"Key invalid: {status_code}")
            print(f"文字翻译密钥无效 (线程 {thread_id}, ID: {request_id}) [{key_abbr}]: 状态码={status_code}")
        elif 200 <= status_code < 300:
            # 成功响应
            result_data = response.json()
            output_size = len(response.content)

            # 检查响应中是否有翻译结果
            if result_data and isinstance(result_data, list) and len(result_data) > 0:
                first_result = result_data[0]
                if 'translations' in first_result and len(first_result['translations']) > 0:
                    translated_text = first_result['translations'][0]['text']
                    success = True
                    print(f"文字翻译成功 (线程 {thread_id}, ID: {request_id}) [{key_abbr}]: '{TRANSLATION_TEXT}' -> '{translated_text}'")
                    # 成功时报告状态
                    translation_key_manager.report_key_status_safe(azure_key, 200, "Translation success")
                else:
                    success = False
                    error_msg = f"翻译响应格式异常: 未找到translations (ID: {request_id})"
            else:
                success = False
                error_msg = f"翻译响应格式异常: {json.dumps(result_data)[:200]} (ID: {request_id})"

            if not success:
                # 格式错误时也报告状态，参考语音脚本的实现
                translation_key_manager.report_key_status_safe(azure_key, 200, f"Translation format error: {error_msg[:100]}")
                print(f"翻译响应格式异常 (线程 {thread_id}, ID: {request_id}) [{key_abbr}]: {error_msg}")
        else:
            # 其他错误状态码
            error_msg = f"HTTP错误 ({status_code}) (ID: {request_id})"
            if response.text:
                error_msg += f" | 响应: {response.text[:200]}"
            translation_key_manager.report_key_status_safe(azure_key, status_code, f"HTTP error: {status_code}")
            print(f"文字翻译HTTP错误 (线程 {thread_id}, ID: {request_id}) [{key_abbr}]: 状态码={status_code}")

    except requests.exceptions.Timeout:
        error_msg = f"请求超时 (ID: {request_id})"
        if azure_key_info:
            translation_key_manager.report_key_status_safe(azure_key_info['key'], 408, "Request timeout")
    except requests.exceptions.RequestException as e:
        error_msg = f"请求异常: {e} (ID: {request_id})"
        if response is not None:
            error_msg += f" | 状态码: {response.status_code}"
            if azure_key_info:
                translation_key_manager.report_key_status_safe(azure_key_info['key'], response.status_code, f"Request exception: {str(e)[:100]}")
    except Exception as e:
        error_msg = f"意外错误: {traceback.format_exc()} (ID: {request_id})"
        if azure_key_info:
            translation_key_manager.report_key_status_safe(azure_key_info['key'], 500, f"Unexpected error: {str(e)[:100]}")
    finally:
        # 记录结果
        end_time = time.time()
        total_time = end_time - start_time
        result_list.append((success, total_time, time_to_first_chunk, input_size, output_size, error_msg, request_id, translated_text))

# --- 语音翻译API测试函数 ---
def test_speech_translation_api(thread_id, result_list, proxies=None):
    """向语音翻译API发送请求并记录结果（使用合成音频数据）"""
    start_time = time.time()
    time_to_first_chunk = None
    success = False
    error_msg = ""
    input_size = 0
    output_size = 0
    response = None
    request_id = f"SpeechTranslation-{thread_id}-{uuid.uuid4()}"
    translated_text = ""
    azure_key_info = None

    try:
        # 获取Azure翻译密钥
        azure_key_info = AzureTranslationKeyManager.get_azure_key_with_retry()
        if not azure_key_info:
            raise Exception("无法获取可用的Azure翻译密钥")

        azure_key = azure_key_info['key']
        azure_region = azure_key_info['region']
        key_abbr = get_key_abbreviation(azure_key)

        # 生成合成音频数据 (WAV格式)
        sample_rate = 16000
        duration = 2.0  # 2秒
        frequency = 440  # A4音符
        
        # 生成正弦波
        t = np.linspace(0, duration, int(sample_rate * duration), False)
        audio_samples = np.sin(frequency * 2 * np.pi * t)
        
        # 转换为16位PCM
        audio_samples = (audio_samples * 32767).astype(np.int16)
        
        # 创建WAV文件数据
        wav_buffer = io.BytesIO()
        
        # WAV文件头
        wav_buffer.write(b'RIFF')
        wav_buffer.write((36 + len(audio_samples) * 2).to_bytes(4, 'little'))
        wav_buffer.write(b'WAVE')
        wav_buffer.write(b'fmt ')
        wav_buffer.write((16).to_bytes(4, 'little'))
        wav_buffer.write((1).to_bytes(2, 'little'))  # PCM
        wav_buffer.write((1).to_bytes(2, 'little'))  # mono
        wav_buffer.write(sample_rate.to_bytes(4, 'little'))
        wav_buffer.write((sample_rate * 2).to_bytes(4, 'little'))
        wav_buffer.write((2).to_bytes(2, 'little'))
        wav_buffer.write((16).to_bytes(2, 'little'))
        wav_buffer.write(b'data')
        wav_buffer.write((len(audio_samples) * 2).to_bytes(4, 'little'))
        wav_buffer.write(audio_samples.tobytes())
        
        audio_data = wav_buffer.getvalue()
        input_size = len(audio_data)

        # 构建请求URL (使用Speech Service的翻译端点)
        endpoint = f"https://{azure_region}.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe"
        params = {
            'api-version': '2024-11-15'
        }
        headers = {
            'Ocp-Apim-Subscription-Key': azure_key,
            'Accept': 'application/json',
            'X-ClientTraceId': request_id
        }

        # 准备multipart/form-data请求
        definition = {
            "locales": ["en-US"],
            "profanityFilterMode": "Masked",
            "channels": [0]
        }

        # 准备multipart表单数据
        files = {
            'audio': ('test_audio.wav', audio_data, 'audio/wav'),
            'definition': (None, json.dumps(definition), 'application/json')
        }

        # 发送请求
        response = requests.post(endpoint, params=params, headers=headers, files=files, proxies=proxies, timeout=60)

        # 处理不同的HTTP状态码
        status_code = response.status_code

        if status_code == 429:
            # 请求过多，设置密钥为429状态
            error_msg = f"请求过多 (429) (ID: {request_id})"
            result_ = translation_key_manager.report_key_status_safe(azure_key, 429, "Rate limit exceeded")
            if result_ and result_.get('success'):
                print(f"语音翻译请求过多 (线程 {thread_id}, ID: {request_id}) [{key_abbr}]: 密钥已设置为429状态")
        elif status_code in [401, 403, 404]:
            # 密钥无效，设置为相应状态
            error_msg = f"密钥无效 ({status_code}) (ID: {request_id})"
            translation_key_manager.report_key_status_safe(azure_key, status_code, f"Key invalid: {status_code}")
            print(f"语音翻译密钥无效 (线程 {thread_id}, ID: {request_id}) [{key_abbr}]: 状态码={status_code}")
        elif 200 <= status_code < 300:
            # 成功响应
            result_data = response.json()
            output_size = len(response.content)

            # 检查响应中是否有转录结果（这里模拟语音翻译）
            if 'combinedPhrases' in result_data:
                combined_phrases = result_data['combinedPhrases']
                if combined_phrases and len(combined_phrases) > 0 and 'text' in combined_phrases[0]:
                    translated_text = combined_phrases[0]['text']
                    success = True
                    print(f"语音翻译成功 (线程 {thread_id}, ID: {request_id}) [{key_abbr}]: 识别文本='{translated_text}'")
                    # 成功时不报告状态，减少日志
                else:
                    success = False
                    error_msg = f"语音翻译响应格式异常: 未找到文本内容 (ID: {request_id})"
            else:
                success = False
                error_msg = f"语音翻译响应格式异常: {json.dumps(result_data)[:200]} (ID: {request_id})"

            if not success:
                translation_key_manager.report_key_status_safe(azure_key, 200, f"Speech translation format error: {error_msg[:100]}")
        else:
            # 其他错误状态码
            error_msg = f"HTTP错误 ({status_code}) (ID: {request_id})"
            if response.text:
                error_msg += f" | 响应: {response.text[:200]}"
            translation_key_manager.report_key_status_safe(azure_key, status_code, f"HTTP error: {status_code}")
            print(f"语音翻译HTTP错误 (线程 {thread_id}, ID: {request_id}) [{key_abbr}]: 状态码={status_code}")

    except requests.exceptions.Timeout:
        error_msg = f"请求超时 (ID: {request_id})"
        if azure_key_info:
            translation_key_manager.report_key_status_safe(azure_key_info['key'], 408, "Request timeout")
    except requests.exceptions.RequestException as e:
        error_msg = f"请求异常: {e} (ID: {request_id})"
        if response is not None:
            error_msg += f" | 状态码: {response.status_code}"
            if azure_key_info:
                translation_key_manager.report_key_status_safe(azure_key_info['key'], response.status_code, f"Request exception: {str(e)[:100]}")
    except Exception as e:
        error_msg = f"意外错误: {traceback.format_exc()} (ID: {request_id})"
        if azure_key_info:
            translation_key_manager.report_key_status_safe(azure_key_info['key'], 500, f"Unexpected error: {str(e)[:100]}")
    finally:
        # 记录结果
        end_time = time.time()
        total_time = end_time - start_time
        result_list.append((success, total_time, time_to_first_chunk, input_size, output_size, error_msg, request_id, translated_text))

# --- 均匀RPM测试逻辑 ---
def run_test_even_rpm(target_api_func, test_name, proxies):
    """执行均匀RPM测试并收集结果"""
    # 初始化测试数据
    test_results = []
    request_counter = AtomicCounter(0)
    active_threads = []
    start_run_time = time.time()
    
    # 确定任务数量和模式
    use_duration = False
    if TOTAL_REQUESTS and TOTAL_REQUESTS > 0:
        use_duration = False
    else:
        use_duration = True
    
    # 计算请求间隔时间（秒）
    request_interval = 60.0 / TARGET_RPM
    test_duration_seconds = TEST_DURATION_MINUTES * 60
    total_requests_expected = int(TARGET_RPM * TEST_DURATION_MINUTES)
    
    # 创建停止事件
    stop_event = threading.Event()
    
    # 打印测试信息
    print(f"\n--- 开始测试: {test_name} (均匀RPM模式) ---")
    print(f"目标RPM: {TARGET_RPM}, 请求间隔: {request_interval:.4f}秒")
    print(f"测试持续时间: {TEST_DURATION_MINUTES}分钟, 预期请求数: {total_requests_expected}")
    
    # 翻译测试不需要检查音频文件
    print("翻译测试使用文本数据，跳过文件检查")
    
    # 定义请求线程函数
    def api_worker(thread_id):
        """单个API请求工作者"""
        try:
            target_api_func(thread_id, test_results, proxies)
            request_counter.increment()
        except Exception as e:
            print(f"工作线程{thread_id}遇到未处理的错误: {e}")
            traceback.print_exc()
            error_msg = f"工作线程未捕获异常: {traceback.format_exc()}"
            request_id = f"worker-{thread_id}-error-{uuid.uuid4()}"
            test_results.append((False, 0, None, 0, 0, error_msg, request_id, ""))
    
    # 定义分发线程函数
    def dispatcher():
        """在固定间隔发射请求的分发器"""
        request_id = 0
        next_time = time.time()
        
        while not stop_event.is_set():
            current_time = time.time()
            elapsed_time = current_time - start_run_time
            
            # 检查是否达到测试持续时间
            if elapsed_time >= test_duration_seconds:
                print("\n达到测试持续时间，停止发射新请求...")
                if not stop_event.is_set():
                    stop_event.set()
                break
            
            # 如果当前时间已经达到或超过下一个计划时间，发射新请求
            if current_time >= next_time:
                thread_id = f"Request-{request_id}"
                thread = threading.Thread(target=api_worker, args=(thread_id,), name=thread_id)
                thread.daemon = True
                thread.start()
                active_threads.append(thread)
                
                # 计算下一个请求时间
                next_time += request_interval
                request_id += 1
                
                # 修正下一个请求时间，如果有累积延迟
                if current_time > next_time:
                    # 如果延迟太大，跳过部分请求以赶上
                    skips = int((current_time - next_time) / request_interval)
                    if skips > 0:
                        print(f"警告: 系统延迟，跳过 {skips} 个请求以保持RPM")
                        next_time += skips * request_interval
                        request_id += skips
            
            # 打印进度
            if request_id % 10 == 0:
                completed = request_counter.value
                print(f"\r测试进行中: {elapsed_time:.1f}/{test_duration_seconds:.1f}秒 | 发射请求: {request_id} | 完成请求: {completed}", end="")
            
            # 移除已完成的线程
            active_threads[:] = [t for t in active_threads if t.is_alive()]
            
            # 小睡以减少CPU使用
            remaining = next_time - time.time()
            if remaining > 0:
                time.sleep(min(remaining, 0.1))  # 最多睡眠0.1秒，保持响应性
    
    # 启动分发线程
    dispatch_thread = threading.Thread(target=dispatcher, name="Dispatcher")
    dispatch_thread.daemon = True
    dispatch_thread.start()
    
    try:
        # 等待分发线程完成
        dispatch_thread.join()
        
        # 等待所有活跃线程完成
        print("\n等待所有活跃请求完成...")
        timeout_per_thread = 30  # 每个线程的超时时间（秒）
        for t in active_threads:
            t.join(timeout=timeout_per_thread)
            if t.is_alive():
                print(f"警告: 线程 {t.name} 在超时后仍未完成。")
    except KeyboardInterrupt:
        print("\n收到键盘中断，正在终止测试...")
        stop_event.set()
    
    # 计算测试结果
    end_run_time = time.time()
    actual_duration = end_run_time - start_run_time
    final_request_count = request_counter.value
    
    print(f"\n--- 测试完成: {test_name} ---")
    print(f"实际持续时间: {actual_duration:.2f}秒")
    print(f"完成的总请求数: {final_request_count}")
    
    # 检查是否有结果
    total_results_recorded = len(test_results)
    if total_results_recorded == 0:
        print("未记录任何结果。")
        return None
    
    print(f"记录的总结果数: {total_results_recorded}")
    
    # 计算统计信息
    success_count = sum(1 for r in test_results if r[0])
    error_count = total_results_recorded - success_count
    total_latency = sum(r[1] for r in test_results if r[0])
    
    # 计算平均值
    avg_latency = total_latency / success_count if success_count > 0 else 0
    success_rate = (success_count / total_results_recorded) * 100 if total_results_recorded > 0 else 0
    actual_rpm = (success_count / max(actual_duration, 0.001)) * 60
    
    # 计算字符统计
    total_chars = 0
    if target_api_func in [test_text_translation_api, test_speech_translation_api]:
        # 对于翻译API，提取已翻译的文本字符数
        total_chars = sum(len(r[7]) for r in test_results if r[0] and r[7])
    else:
        # 对于其他API，使用输出大小的估计
        total_chars = sum(r[4] for r in test_results if r[0]) // 4  # 假设平均每个字符4字节

    # 计算平均请求时长（毫秒）
    avg_request_duration = (total_latency * 1000 / success_count) if success_count > 0 else 0
    
    # 打印结果摘要
    print(f"\n{test_name}的结果摘要:")
    print(f"  记录的总结果数: {total_results_recorded}")
    print(f"  成功结果数: {success_count}")
    print(f"  失败结果数: {error_count}")
    print(f"  成功率: {success_rate:.2f}%")
    print(f"  总识别字符数: {total_chars}")
    print(f"  平均请求时长: {avg_request_duration:.2f}毫秒")
    print(f"  实际RPM（基于成功计数）: {actual_rpm:.2f}")
    
    # 保存结果到CSV
    timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    csv_filename = os.path.join(CSV_OUTPUT_DIR, f"{timestamp_str}_{test_name}_EvenRPM{TARGET_RPM}_{TEST_DURATION_MINUTES}min.csv")
    
    # CSV表头
    headers = [
        "时间戳", "测试名称", "目标RPM", "目标持续时间(秒)", "目标总请求数",
        "最大工作线程数", "实际持续时间(秒)", "记录的总结果数", "成功数",
        "错误数", "成功率(%)", "总字符数", "平均请求时长(毫秒)",
        "实际RPM", "错误样本"
    ]

    # 收集错误样本
    error_messages = list(set(r[5] for r in test_results if not r[0] and r[5]))
    errors_sample = " | ".join(error_messages[:5])
    
    # 统计各种错误类型的数量
    error_stats = {}
    for result in test_results:
        if not result[0] and result[5]:  # 失败的请求且有错误信息
            error_msg = result[5]
            error_stats[error_msg] = error_stats.get(error_msg, 0) + 1
    
    # 打印详细错误统计
    if error_stats:
        print(f"\n详细错误统计:")
        for error_msg, count in sorted(error_stats.items(), key=lambda x: x[1], reverse=True):
            print(f"  {error_msg}: {count}次")

    # 创建CSV行数据
    summary_row = [
        timestamp_str,
        test_name,
        TARGET_RPM,
        test_duration_seconds if use_duration else "N/A",
        TOTAL_REQUESTS if not use_duration else "N/A",
        MAX_WORKERS,
        f"{actual_duration:.2f}",
        total_results_recorded,
        success_count,
        error_count,
        f"{success_rate:.2f}",
        total_chars,
        f"{avg_request_duration:.2f}",
        f"{actual_rpm:.2f}",
        errors_sample
    ]
    
    # 写入CSV文件
    try:
        with open(csv_filename, "w", newline="", encoding="utf-8") as csvfile:
            csv_writer = csv.writer(csvfile)
            csv_writer.writerow(headers)
            csv_writer.writerow(summary_row)
        print(f"结果摘要已保存到: {csv_filename}")
    except Exception as e:
        print(f"写入CSV时发生错误: {e}")
        traceback.print_exc()
    
    return summary_row

# --- 脚本入口点 ---
if __name__ == "__main__":
    print("Azure Translation 服务并发性能测试器 (RPM均匀发射版)")
    print("="*50)

    http_proxy = "127.0.0.1:20809"
    http_proxy = "127.0.0.1:52390"
    http_proxy = None
    proxies={
        "http": http_proxy,
        "https": http_proxy
    }

    # 跳过音频文件检查（翻译测试不需要音频文件）
    print("跳过音频文件检查：翻译测试使用文本数据")

    # 测试Translation Key Manager API连接
    try:
        result = translation_key_manager.get_key('eastasia')
        if result.get('success'):
            print("Key Manager API连接正常")
        else:
            print(f"Key Manager API连接失败: {result.get('error', '未知错误')}")
            print("请确保Key Manager服务正在运行在 http://localhost:3019")
    except Exception as e:
        print(f"Key Manager API连接异常: {e}")
        print("请确保Key Manager服务正在运行在 http://localhost:3019")

    # 开始测试
    print("\n开始文字翻译测试...")
    run_test_even_rpm(test_text_translation_api, "TextTranslation", proxies)
    print("\n文字翻译测试完成。等待5秒后开始语音翻译测试...")
    time.sleep(5)

    print("\n开始语音翻译测试...")
    run_test_even_rpm(test_speech_translation_api, "SpeechTranslation", proxies)
    print("\n语音翻译测试完成。")

    print("\n所有测试已完成。")