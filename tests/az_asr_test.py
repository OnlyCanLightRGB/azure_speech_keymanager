# ##############################################################################
# Azure ASR & Transcription 服务并发性能测试器 (RPM均匀发射版)
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

# Azure Key Manager API配置
KEY_MANAGER_BASE_URL = "http://localhost:3019/api"

class AzureKeyManager:
    """Azure Key Manager API客户端 - 支持全局key管理"""

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
        with AzureKeyManager._lock:
            if AzureKeyManager._update_thread is None:
                AzureKeyManager._stop_update = False
                AzureKeyManager._update_thread = threading.Thread(
                    target=self._update_key_periodically,
                    daemon=True,
                    name="KeyUpdater"
                )
                AzureKeyManager._update_thread.start()
                print("启动密钥定期更新线程")

    def get_key(self, region='eastasia'):
        """获取可用的密钥（原始API调用方法）"""
        try:
            response = requests.get(f'{self.base_url}/keys/get', params={'region': region}, timeout=10, proxies=self.proxies)
            return response.json()
        except Exception as e:
            print(f"获取密钥失败: {e}")
            return {'success': False, 'error': str(e)}

    def report_status(self, key, status_code, note=''):
        """报告密钥使用状态"""
        try:
            data = {'key': key, 'code': status_code, 'note': note}
            response = requests.post(f'{self.base_url}/keys/status', json=data, timeout=10, proxies=self.proxies)
            return response.json()
        except Exception as e:
            print(f"报告密钥状态失败: {e}")
            return {'success': False, 'error': str(e)}

    def _update_key_periodically(self):
        """定期更新密钥的后台线程"""
        while not AzureKeyManager._stop_update:
            try:
                # 获取新的密钥
                result = self.get_key()
                current_time = time.time()

                if result.get('success') and result.get('data'):
                    with AzureKeyManager._lock:
                        old_key = AzureKeyManager.current_key
                        AzureKeyManager.current_key = result['data']
                        AzureKeyManager._last_update_time = current_time

                        # 只在密钥变化时打印日志
                        new_key_abbr = get_key_abbreviation(AzureKeyManager.current_key.get('key', ''))
                        if old_key is None:
                            print(f"初始化全局密钥: {new_key_abbr} | 区域: {AzureKeyManager.current_key.get('region', '')}")
                        elif old_key.get('key') != AzureKeyManager.current_key.get('key'):
                            old_key_abbr = get_key_abbreviation(old_key.get('key', ''))
                            print(f"全局密钥更新: {old_key_abbr} -> {new_key_abbr} | 区域: {AzureKeyManager.current_key.get('region', '')}")
                else:
                    print(f"定期更新密钥失败: {result}")

            except Exception as e:
                print(f"定期更新密钥异常: {e}")

            # 等待5秒 - 平衡密钥轮换和冷却恢复
            time.sleep(5)

    @classmethod
    def get_azure_key_with_retry(cls, region='eastasia', max_retries=3):
        """获取Azure密钥，从类变量获取（支持重试）"""
        for attempt in range(max_retries):
            try:
                with cls._lock:
                    if cls.current_key is not None:
                        key_data = cls.current_key.copy()
                        key_abbr = get_key_abbreviation(key_data.get('key', ''))
                        print(f"获取全局密钥成功 (尝试 {attempt + 1}/{max_retries}): {key_abbr} | 区域: {key_data.get('region', '')} | 更新时间: {time.time() - cls._last_update_time:.1f}秒前")
                        return key_data
                    else:
                        print(f"全局密钥未初始化 (尝试 {attempt + 1}/{max_retries})")
                        if attempt < max_retries - 1:
                            time.sleep(1)  # 等待密钥初始化
            except Exception as e:
                print(f"获取全局密钥异常 (尝试 {attempt + 1}/{max_retries}): {e}")
                if attempt < max_retries - 1:
                    time.sleep(1)
        return None

    def report_key_status_safe(self, key, status_code, note=''):
        """安全地报告密钥状态，不抛出异常"""
        if status_code == 200:
            return {'success': True}
        key_abbr = get_key_abbreviation(key)
        try:
            result = self.report_status(key, status_code, note)
            if result and not result.get('success'):
                # print(f"报告密钥状态失败 [{key_abbr}]: {result.get('error', '未知错误')}")
                pass
            else:
                print(f"报告密钥状态成功 [{key_abbr}]: 状态码={status_code}, 备注={note}")
            return result
        except Exception as e:
            print(f"报告密钥状态异常 [{key_abbr}]: {e}")
            return {'success': False, 'error': str(e)}

# 全局Key Manager实例
key_manager = AzureKeyManager()

def get_key_abbreviation(key):
    """生成密钥简写，用于日志显示"""
    if not key or len(key) < 8:
        return key
    return f"{key[:4]}...{key[-4:]}"


# ASR 测试参数
ASR_AUDIO_FILE = r'A13_160.wav'  # 5s
ASR_AUDIO_FILE = r'asr_vad_punc_example.wav' # 13s
ASR_LANGUAGE_CODE = "zh-CN"  # 音频语言
ASR_SAMPLE_RATE = "44100"  # 采样率

# 测试参数
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


# --- Transcription API测试函数（带容错处理） ---
def test_transcription_api(thread_id, result_list, proxies=None):
    """向转录API发送请求并记录结果，支持密钥管理和容错"""
    start_time = time.time()
    time_to_first_chunk = None  # 不适用于此API
    success = False
    error_msg = ""
    input_size = 0
    output_size = 0
    response = None
    request_id = f"Transcription-{thread_id}-{uuid.uuid4()}"
    transcribed_text = ""  # 保存转录的文本
    azure_key_info = None

    try:
        # 检查音频文件是否存在
        if not os.path.exists(ASR_AUDIO_FILE) or not os.path.isfile(ASR_AUDIO_FILE):
            raise FileNotFoundError(f"音频文件未找到: {ASR_AUDIO_FILE}")

        # 获取Azure密钥
        azure_key_info = AzureKeyManager.get_azure_key_with_retry()
        if not azure_key_info:
            raise Exception("无法获取可用的Azure密钥")

        azure_key = azure_key_info['key']
        azure_region = azure_key_info['region']
        key_abbr = get_key_abbreviation(azure_key)

        # 构建请求URL - 使用动态endpoint
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
            "locales": [ASR_LANGUAGE_CODE],
            "profanityFilterMode": "Masked",
            "channels": [0]  # 假设是单声道音频
        }

        # 读取音频文件
        with open(ASR_AUDIO_FILE, 'rb') as audio_file:
            audio_data = audio_file.read()
            input_size = len(audio_data)

        # 准备multipart表单数据
        files = {
            'audio': (os.path.basename(ASR_AUDIO_FILE), audio_data, 'audio/wav'),
            'definition': (None, json.dumps(definition), 'application/json')
        }

        # 发送请求
        response = requests.post(endpoint, params=params, headers=headers, files=files, proxies=proxies, timeout=60)

        # 处理不同的HTTP状态码
        status_code = response.status_code

        if status_code == 429:
            # 请求过多，设置密钥为429状态
            error_msg = f"请求过多 (429) (ID: {request_id})"
            result_ = key_manager.report_key_status_safe(azure_key, 429, "Rate limit exceeded")
            if result_ and result_.get('success'):
                print(f"Transcription请求过多 (线程 {thread_id}, ID: {request_id}) [{key_abbr}]: 密钥已设置为429状态")
        elif status_code in [401, 403, 404]:
            # 密钥无效，设置为相应状态
            error_msg = f"密钥无效 ({status_code}) (ID: {request_id})"
            key_manager.report_key_status_safe(azure_key, status_code, f"Key invalid: {status_code}")
            print(f"Transcription密钥无效 (线程 {thread_id}, ID: {request_id}) [{key_abbr}]: 状态码={status_code}")
        elif 200 <= status_code < 300:
            # 成功响应
            result_data = response.json()
            output_size = len(response.content)

            # 检查响应中是否有文本结果 - 支持多种响应格式
            if 'results' in result_data and 'channels' in result_data['results']:
                # 原始预期格式
                success = True
                # 提取第一个通道的转录文本
                channel_results = result_data['results']['channels']
                if channel_results and len(channel_results) > 0 and 'lexical' in channel_results[0]:
                    transcribed_text = channel_results[0]['lexical']
                    print(f"转录成功 (线程 {thread_id}, ID: {request_id}) [{key_abbr}]: 转录文本='{transcribed_text}'")
                else:
                    success = False
                    error_msg = f"转录响应格式异常: 未找到文本内容 (ID: {request_id})"
            elif 'combinedPhrases' in result_data:
                # 新的响应格式 - 包含combinedPhrases
                success = True
                combined_phrases = result_data['combinedPhrases']
                if combined_phrases and len(combined_phrases) > 0 and 'text' in combined_phrases[0]:
                    transcribed_text = combined_phrases[0]['text']
                    print(f"转录成功(新格式) (线程 {thread_id}, ID: {request_id}) [{key_abbr}]: 转录文本='{transcribed_text}'")
                else:
                    success = False
                    error_msg = f"转录响应格式异常(新格式): 未找到文本内容 (ID: {request_id})"
            else:
                success = False
                error_msg = f"转录响应格式异常: {json.dumps(result_data)[:200]} (ID: {request_id})"

            # 报告成功状态
            if success:
                key_manager.report_key_status_safe(azure_key, 200, "Transcription success")
            else:
                key_manager.report_key_status_safe(azure_key, 200, f"Transcription format error: {error_msg[:100]}")
        else:
            # 其他错误状态码
            error_msg = f"HTTP错误 ({status_code}) (ID: {request_id})"
            if response.text:
                error_msg += f" | 响应: {response.text[:200]}"
            key_manager.report_key_status_safe(azure_key, status_code, f"HTTP error: {status_code}")
            print(f"Transcription HTTP错误 (线程 {thread_id}, ID: {request_id}) [{key_abbr}]: 状态码={status_code}")

    except requests.exceptions.Timeout:
        error_msg = f"请求超时 (ID: {request_id})"
        if azure_key_info:
            key_manager.report_key_status_safe(azure_key_info['key'], 408, "Request timeout")
    except requests.exceptions.RequestException as e:
        error_msg = f"请求异常: {e} (ID: {request_id})"
        if response is not None:
            error_msg += f" | 状态码: {response.status_code}"
            if azure_key_info:
                key_manager.report_key_status_safe(azure_key_info['key'], response.status_code, f"Request exception: {str(e)[:100]}")
    except FileNotFoundError as fnf:
        error_msg = str(fnf)
    except Exception as e:
        error_msg = f"意外错误: {traceback.format_exc()} (ID: {request_id})"
        if azure_key_info:
            key_manager.report_key_status_safe(azure_key_info['key'], 500, f"Unexpected error: {str(e)[:100]}")
    finally:
        # 记录结果
        end_time = time.time()
        total_time = end_time - start_time
        result_list.append((success, total_time, time_to_first_chunk, input_size, output_size, error_msg, request_id, transcribed_text))

# --- ASR API测试函数（带容错处理） ---
def test_asr_short_audio_api(thread_id, result_list, proxies=None):
    """向ASR短音频API发送请求并记录结果，支持密钥管理和容错"""
    start_time = time.time()
    time_to_first_chunk = None  # 不适用于短ASR REST API
    success = False
    error_msg = ""
    input_size = 0
    output_size = 0
    response = None
    request_id = f"ASR-{thread_id}-{uuid.uuid4()}"
    transcribed_text = ""  # 存储识别的文本
    azure_key_info = None

    try:
        # 检查音频文件是否存在
        if not os.path.exists(ASR_AUDIO_FILE) or not os.path.isfile(ASR_AUDIO_FILE):
            raise FileNotFoundError(f"ASR音频文件未找到: {ASR_AUDIO_FILE}")

        # 获取Azure密钥
        azure_key_info = AzureKeyManager.get_azure_key_with_retry()
        if not azure_key_info:
            raise Exception("无法获取可用的Azure密钥")

        azure_key = azure_key_info['key']
        azure_region = azure_key_info['region']
        key_abbr = get_key_abbreviation(azure_key)

        # 构建请求URL和参数
        endpoint = f"https://{azure_region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1"
        params = {
            'language': ASR_LANGUAGE_CODE,
            'format': 'detailed'  # 请求详细格式以获取RecognitionStatus
        }
        headers = {
            'Ocp-Apim-Subscription-Key': azure_key,
            'Content-Type': f'audio/wav; codecs=audio/pcm; samplerate={ASR_SAMPLE_RATE}',
            'Accept': 'application/json;text/xml',
            'X-ClientTraceId': request_id
        }

        # 读取音频文件
        with open(ASR_AUDIO_FILE, 'rb') as audio_file:
            audio_data = audio_file.read()
            input_size = len(audio_data)

        # 发送请求
        response = requests.post(endpoint, params=params, headers=headers, data=audio_data, proxies=proxies, timeout=45)

        # 处理不同的HTTP状态码
        status_code = response.status_code

        if status_code == 429:
            # 请求过多，设置密钥为429状态
            error_msg = f"请求过多 (429) (ID: {request_id})"
            result_ = key_manager.report_key_status_safe(azure_key, 429, "Rate limit exceeded")
            if result_.get('success'):
                print(f"ASR请求过多 (线程 {thread_id}, ID: {request_id}) [{key_abbr}]: 密钥已设置为429状态")
        elif status_code in [401, 403, 404]:
            # 密钥无效，设置为相应状态
            error_msg = f"密钥无效 ({status_code}) (ID: {request_id})"
            key_manager.report_key_status_safe(azure_key, status_code, f"Key invalid: {status_code}")
            print(f"ASR密钥无效 (线程 {thread_id}, ID: {request_id}) [{key_abbr}]: 状态码={status_code}")
        elif 200 <= status_code < 300:
            # 成功响应
            result_data = response.json()
            output_size = len(response.content)
            recognition_status = result_data.get("RecognitionStatus", "Unknown")

            if recognition_status == "Success":
                success = True
                transcribed_text = result_data.get('DisplayText', '未找到识别文本')
                print(f"ASR识别成功 (线程 {thread_id}, ID: {request_id}) [{key_abbr}]: 识别文本='{transcribed_text}'")
                # 报告成功
                key_manager.report_key_status_safe(azure_key, 200, "ASR success")
            elif recognition_status == "NoMatch":
                success = False
                error_msg = f"ASR无匹配: 未能识别语音内容 (ID: {request_id})"
                print(f"ASR识别无匹配 (线程 {thread_id}, ID: {request_id}) [{key_abbr}]: {error_msg}")
                # 报告成功（技术上请求成功，只是没有识别到内容）
                key_manager.report_key_status_safe(azure_key, 200, "ASR no match")
            else:
                success = False
                error_msg = f"ASR非成功状态: {recognition_status} (ID: {request_id})"
                print(f"ASR识别失败 (线程 {thread_id}, ID: {request_id}) [{key_abbr}]: 状态={recognition_status}")
                # 报告成功（HTTP成功但识别失败）
                key_manager.report_key_status_safe(azure_key, 200, f"ASR recognition failed: {recognition_status}")
        else:
            # 其他错误状态码
            error_msg = f"HTTP错误 ({status_code}) (ID: {request_id})"
            if response.text:
                error_msg += f" | 响应: {response.text[:200]}"
            key_manager.report_key_status_safe(azure_key, status_code, f"HTTP error: {status_code}")
            print(f"ASR HTTP错误 (线程 {thread_id}, ID: {request_id}) [{key_abbr}]: 状态码={status_code}")

    except requests.exceptions.Timeout:
        error_msg = f"请求超时 (ID: {request_id})"
        if azure_key_info:
            key_manager.report_key_status_safe(azure_key_info['key'], 408, "Request timeout")
    except requests.exceptions.RequestException as e:
        error_msg = f"请求异常: {e} (ID: {request_id})"
        if response is not None:
            error_msg += f" | 状态码: {response.status_code}"
            if azure_key_info:
                key_manager.report_key_status_safe(azure_key_info['key'], response.status_code, f"Request exception: {str(e)[:100]}")
    except FileNotFoundError as fnf:
        error_msg = str(fnf)
    except Exception as e:
        error_msg = f"意外错误: {traceback.format_exc()} (ID: {request_id})"
        if azure_key_info:
            key_manager.report_key_status_safe(azure_key_info['key'], 500, f"Unexpected error: {str(e)[:100]}")
    finally:
        # 记录结果
        end_time = time.time()
        total_time = end_time - start_time
        result_list.append((success, total_time, time_to_first_chunk, input_size, output_size, error_msg, request_id, transcribed_text))

# --- 旧的测试逻辑（保留以便向后兼容） ---
def run_test(target_api_func, test_name):
    """执行并发测试并收集结果（保留旧版本的测试函数）"""
    print("注意：使用的是旧版本的测试框架，建议使用新版本的run_test_even_rpm函数来获得更均匀的RPM测试。")
    # 初始化测试数据
    current_run_results = []
    current_request_counter = create_counter(0)
    threads = []
    start_run_time = time.time()
    
    # 打印测试信息
    print(f"\n--- 开始测试: {test_name} ---")
    duration_msg = TEST_DURATION_SECONDS if TOTAL_REQUESTS is None else "不适用(使用总请求数)"
    total_requests_msg = TOTAL_REQUESTS if TOTAL_REQUESTS is not None else "不适用(使用持续时间)"
    print(f"目标RPM: {TARGET_RPM}, 持续时间: {duration_msg}秒, 总请求数: {total_requests_msg}, 最大工作线程数: {MAX_WORKERS}")

    # 检查音频文件是否存在
    if target_api_func in [test_asr_short_audio_api, test_transcription_api]:
        if not os.path.exists(ASR_AUDIO_FILE) or not os.path.isfile(ASR_AUDIO_FILE):
            print(f"错误: ASR音频文件'{ASR_AUDIO_FILE}'未找到或不是文件。跳过{test_name}测试。")
            return None

    # 确定任务数量和模式
    use_duration = False
    test_duration_seconds = TEST_DURATION_SECONDS or (TEST_DURATION_MINUTES * 60 if TEST_DURATION_MINUTES else 60)
    
    if TOTAL_REQUESTS and TOTAL_REQUESTS > 0:
        num_requests_to_start = TOTAL_REQUESTS
        print(f"目标是精确发送{num_requests_to_start}个请求。")
    elif test_duration_seconds and test_duration_seconds > 0:
        use_duration = True
        estimated_requests = int(math.ceil((TARGET_RPM / 60.0) * test_duration_seconds))
        num_requests_to_start = max(estimated_requests, MAX_WORKERS * 2)
        print(f"目标是在{test_duration_seconds}秒内运行测试。将启动约{num_requests_to_start}个初始任务。")
    else:
        print("错误：必须指定TEST_DURATION_SECONDS > 0或TOTAL_REQUESTS > 0")
        return None

    # 创建任务队列
    task_queue = Queue()
    for i in range(num_requests_to_start):
        task_queue.put(i)

    # 创建停止事件
    stop_event = threading.Event()

    # 定义工作线程函数
    def worker(q, stop_evt, results_list, counter):
        """从队列获取任务并执行API调用"""
        thread_name = threading.current_thread().name
        while not stop_evt.is_set():
            # 检查持续时间是否到达
            if use_duration and (time.time() - start_run_time) >= test_duration_seconds:
                if not stop_evt.is_set():
                    stop_evt.set()
                break

            try:
                # 获取任务并执行
                task_id = q.get(timeout=0.1)
                target_api_func(f"{thread_name}-{task_id}", results_list)
                counter.increment()

                # 检查是否达到总请求数
                if not use_duration and counter.value >= TOTAL_REQUESTS:
                    if not stop_evt.is_set():
                        stop_evt.set()
                    break
            except Empty:
                # 队列为空的处理
                if not use_duration:
                    break
            except Exception as e:
                print(f"工作线程{thread_name}遇到未处理的错误: {e}")
                traceback.print_exc()
                error_msg_worker = f"工作线程未捕获异常: {traceback.format_exc()}"
                request_id_worker = f"worker-{thread_name}-error-{uuid.uuid4()}"
                results_list.append((False, 0, None, 0, 0, error_msg_worker, request_id_worker, ""))

    # 创建并启动工作线程
    actual_workers = min(MAX_WORKERS, num_requests_to_start if not use_duration else MAX_WORKERS)
    print(f"启动{actual_workers}个工作线程...")
    for i in range(actual_workers):
        t = threading.Thread(target=worker, args=(task_queue, stop_event, current_run_results, current_request_counter), name=f"Worker-{i}", daemon=True)
        t.start()
        threads.append(t)

    # 等待测试完成
    if use_duration and test_duration_seconds:
        # 基于持续时间的测试
        end_wait_time = start_run_time + test_duration_seconds
        while time.time() < end_wait_time:
            if stop_event.is_set():
                break
            elapsed = time.time() - start_run_time
            processed_count = current_request_counter.value
            q_size = task_queue.qsize()
            print(f"\r测试进行中: {elapsed:.1f}/{test_duration_seconds:.1f}秒 | 已处理请求: {processed_count} | 队列中: {q_size}   ", end="")
            time.sleep(0.5)
        print()
        if not stop_event.is_set():
            stop_event.set()
    else:
        # 基于总请求数的测试
        while not stop_event.is_set():
            processed_count = current_request_counter.value
            q_size = task_queue.qsize()
            all_threads_done = all(not t.is_alive() for t in threads)

            # 检查是否达到总请求数
            if not use_duration and processed_count >= TOTAL_REQUESTS:
                if not stop_event.is_set():
                    stop_event.set()
                break
            
            # 检查队列是否为空且所有任务都已完成
            if q_size == 0 and processed_count >= num_requests_to_start:
                time.sleep(0.5)
                all_threads_done = all(not t.is_alive() for t in threads)
                if all_threads_done:
                    if not stop_event.is_set():
                        stop_event.set()
                    break
            
            print(f"\r测试进行中 (目标{TOTAL_REQUESTS}请求): 已处理: {processed_count} | 队列中: {q_size}   ", end="")
            time.sleep(0.5)
            
            # 如果所有线程都已结束且队列为空，则结束测试
            if all_threads_done and q_size == 0:
                if not stop_event.is_set():
                    stop_event.set()
                break
        print()

    # 等待所有线程完成
    print("等待工作线程完成...")
    for t in threads:
        t.join(timeout=20.0)
        if t.is_alive():
            print(f"警告: 线程{t.name}在超时后仍未结束。")

    # 计算测试结果
    end_run_time = time.time()
    actual_duration = end_run_time - start_run_time
    final_request_count = current_request_counter.value

    print(f"--- 测试完成: {test_name} ---")
    print(f"实际持续时间: {actual_duration:.2f}秒")
    print(f"完成的总请求数: {final_request_count}")

    # 检查是否有结果
    total_results_recorded = len(current_run_results)
    if total_results_recorded == 0:
        print("未记录任何结果。")
        return None

    print(f"记录的总结果数: {total_results_recorded}")

    # 计算统计信息
    success_count = sum(1 for r in current_run_results if r[0])
    error_count = total_results_recorded - success_count
    total_latency = sum(r[1] for r in current_run_results if r[0])
    
    # 计算平均值
    avg_latency = total_latency / success_count if success_count > 0 else 0
    success_rate = (success_count / total_results_recorded) * 100 if total_results_recorded > 0 else 0
    actual_rpm = (success_count / max(actual_duration, 0.001)) * 60

    # 计算字符统计
    total_chars = 0
    if target_api_func in [test_asr_short_audio_api, test_transcription_api]:
        # 对于ASR和转录API，提取已转录的文本字符数
        total_chars = sum(len(r[7]) for r in current_run_results if r[0] and r[7])
    else:
        # 对于其他API，使用输出大小的估计
        total_chars = sum(r[4] for r in current_run_results if r[0]) // 4  # 假设平均每个字符4字节

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
    duration_or_req_str = f"{test_duration_seconds}s" if use_duration else f"{TOTAL_REQUESTS}req"
    csv_filename = os.path.join(CSV_OUTPUT_DIR, f"{timestamp_str}_{test_name}_RPM{TARGET_RPM}_{duration_or_req_str}_W{MAX_WORKERS}.csv")

    # CSV表头
    headers = [
        "时间戳", "测试名称", "目标RPM", "目标持续时间(秒)", "目标总请求数",
        "最大工作线程数", "实际持续时间(秒)", "记录的总结果数", "成功数",
        "错误数", "成功率(%)", "总字符数", "平均请求时长(毫秒)",
        "实际RPM", "错误样本"
    ]

    # 收集错误样本
    error_messages = list(set(r[5] for r in current_run_results if not r[0] and r[5]))
    errors_sample = " | ".join(error_messages[:5])

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

# --- 新的均匀RPM测试逻辑 ---
def run_test_even_rpm(target_api_func, test_name, proxies):
    """执行均匀RPM测试并收集结果"""
    # 初始化测试数据
    test_results = []
    request_counter = AtomicCounter(0)
    active_threads = []
    start_run_time = time.time()
    
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
    
    # 检查音频文件是否存在
    if target_api_func in [test_asr_short_audio_api, test_transcription_api]:
        if not os.path.exists(ASR_AUDIO_FILE) or not os.path.isfile(ASR_AUDIO_FILE):
            print(f"错误: ASR音频文件'{ASR_AUDIO_FILE}'未找到或不是文件。跳过{test_name}测试。")
            return None
    
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
    if target_api_func in [test_asr_short_audio_api, test_transcription_api]:
        # 对于ASR和转录API，提取已转录的文本字符数
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
        "时间戳", "测试名称", "目标RPM", "请求间隔(秒)", "测试持续时间(分钟)",
        "预期请求数", "实际持续时间(秒)", "记录的总结果数", "成功数",
        "错误数", "成功率(%)", "总字符数", "平均请求时长(毫秒)",
        "实际RPM", "错误样本"
    ]

    # 收集错误样本（简化版本）
    error_stats = {}
    for result in test_results:
        if not result[0] and result[5]:  # 失败的请求且有错误信息
            error_msg = result[5]
            error_stats[error_msg] = error_stats.get(error_msg, 0) + 1
    
    # 生成简化的错误摘要
    if error_stats:
        # 按错误类型合并统计
        error_type_counts = {
            "429错误": 0,
            "400错误": 0,
            "超时错误": 0,
            "连接错误": 0,
            "其他错误": 0
        }
        
        for error_msg, count in error_stats.items():
            # 提取错误类型的关键信息并累加计数
            if "429" in error_msg:
                error_type_counts["429错误"] += count
            elif "400" in error_msg:
                error_type_counts["400错误"] += count
            elif "timeout" in error_msg.lower() or "超时" in error_msg:
                error_type_counts["超时错误"] += count
            elif "connection" in error_msg.lower() or "连接" in error_msg:
                error_type_counts["连接错误"] += count
            else:
                error_type_counts["其他错误"] += count
        
        # 生成摘要，只显示有错误的类型
        error_summary = []
        for error_type, count in error_type_counts.items():
            if count > 0:
                error_summary.append(f"{error_type}:{count}次")
        
        errors_sample = " | ".join(error_summary[:5])  # 只保留前5种错误类型
        
        print(f"\n错误统计摘要: {errors_sample}")
    else:
        errors_sample = "无错误"

    # 创建CSV行数据
    summary_row = [
        timestamp_str,
        test_name,
        TARGET_RPM,
        f"{request_interval:.4f}",
        TEST_DURATION_MINUTES,
        total_requests_expected,
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
    print("Azure ASR & Transcription 服务并发性能测试器 (RPM均匀发射版)")
    print("="*50)

    http_proxy = "127.0.0.1:20809"
    http_proxy = "127.0.0.1:52390"
    http_proxy = None
    proxies={
        "http": http_proxy,
        "https": http_proxy
    }

    # 检查ASR音频文件
    asr_file_ok = False
    # 检查相对于当前目录和tests目录的音频文件
    audio_paths = [ASR_AUDIO_FILE, f"tests/{ASR_AUDIO_FILE}"]
    for audio_path in audio_paths:
        if os.path.exists(audio_path) and os.path.isfile(audio_path):
            asr_file_ok = True
            ASR_AUDIO_FILE = audio_path  # 更新为正确的路径
            print(f"ASR音频文件检查正常：{ASR_AUDIO_FILE}")
            break
    
    if not asr_file_ok:
        print(f"错误：在'{ASR_AUDIO_FILE}'未找到有效的ASR音频文件。ASR测试将被跳过。")

    # 检查Key Manager API连接
    try:
        result = key_manager.get_key()
        if result.get('success'):
            print("Key Manager API连接正常")
        else:
            print(f"Key Manager API连接失败: {result.get('error', '未知错误')}")
            print("请确保Key Manager服务正在运行在 http://localhost:3019")
    except Exception as e:
        print(f"Key Manager API连接异常: {e}")
        print("请确保Key Manager服务正在运行在 http://localhost:3019")

    # 执行ASR测试
    if asr_file_ok:
        print("\n开始ASR(短音频)测试...")
        run_test_even_rpm(test_asr_short_audio_api, "ASR_ShortAudio", proxies)
        print("\nASR测试完成。等待5秒后开始转录测试...")
        time.sleep(5)

        # print("\n开始转录API测试...")
        # run_test_even_rpm(test_transcription_api, "Transcription", proxies)
        # print("\n转录测试完成。")
        
    else:
        print("\n跳过ASR和转录测试：音频文件不可用")

    print("\n所有测试已完成。")