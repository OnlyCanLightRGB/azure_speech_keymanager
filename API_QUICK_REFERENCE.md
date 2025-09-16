# Azure Speech Key Manager API 快速参考

## 基础信息

- **基础URL**: `http://localhost:3000/api`
- **响应格式**: JSON
- **认证**: 无（建议生产环境添加）

## 密钥管理接口

### 核心接口

| 方法 | 路径 | 说明 | 主要参数 |
|------|------|------|----------|
| GET | `/keys/get` | 获取可用密钥 | `region`, `tag` |
| POST | `/keys/status` | 设置密钥状态 | `key`, `code`, `note` |
| POST | `/keys` | 添加新密钥 | `key`, `region`, `keyname` |
| PUT | `/keys/:key` | 更新密钥 | `keyname`, `region` |
| DELETE | `/keys/:key` | 删除密钥 | - |
| POST | `/keys/:key/disable` | 禁用密钥 | - |
| POST | `/keys/:key/enable` | 启用密钥 | - |
| POST | `/keys/test` | 测试密钥(TTS) | `key`, `region` |
| POST | `/keys/test2` | 测试密钥(STT) | `key`, `region` |

### 查询接口

| 方法 | 路径 | 说明 | 查询参数 |
|------|------|------|----------|
| GET | `/keys` | 获取所有密钥 | - |
| GET | `/keys/logs` | 获取操作日志 | `page`, `limit` |
| GET | `/keys/stats` | 获取统计信息 | - |

## 配置管理接口

| 方法 | 路径 | 说明 | 主要参数 |
|------|------|------|----------|
| GET | `/config` | 获取所有配置 | - |
| GET | `/config/:key` | 获取特定配置 | - |
| POST | `/config` | 创建/更新配置 | `config_key`, `config_value`, `description` |
| PUT | `/config/:key` | 更新配置 | `config_value`, `description` |
| DELETE | `/config/:key` | 删除配置 | - |
| POST | `/config/batch` | 批量更新配置 | `configs[]` |

## 翻译服务接口

| 方法 | 路径 | 说明 | 主要参数 |
|------|------|------|----------|
| GET | `/translation/keys/get` | 获取翻译密钥 | `region` |
| POST | `/translation/keys/status` | 设置翻译密钥状态 | `key`, `code`, `note` |
| POST | `/translation/keys` | 添加翻译密钥 | `key`, `region`, `keyname` |
| GET | `/translation/keys` | 获取所有翻译密钥 | - |
| POST | `/translation/keys/test` | 测试翻译密钥 | `key`, `region` |

## 上传管理接口

| 方法 | 路径 | 说明 | 主要参数 |
|------|------|------|----------|
| POST | `/upload/create-keys` | 批量创建密钥 | `jsonData`, `options` |
| GET | `/upload/template` | 下载JSON模板 | `type` |
| POST | `/upload/validate` | 验证JSON格式 | `jsonData` |

## 系统接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/docs` | API文档 |
| GET | `/system/cleanup` | 系统清理状态 |

## 快速使用示例

### 1. 获取并使用密钥

```bash
# 获取密钥
curl "http://localhost:3000/api/keys/get?region=eastasia"

# 报告使用结果
curl -X POST "http://localhost:3000/api/keys/status" \
  -H "Content-Type: application/json" \
  -d '{"key":"your-key","code":200,"note":"Success"}'
```

### 2. 添加新密钥

```bash
curl -X POST "http://localhost:3000/api/keys" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "your-azure-key",
    "region": "eastasia",
    "keyname": "Production Key 1"
  }'
```

### 3. 测试密钥

```bash
# TTS测试
curl -X POST "http://localhost:3000/api/keys/test" \
  -H "Content-Type: application/json" \
  -d '{"key":"your-key","region":"eastasia"}'

# STT测试
curl -X POST "http://localhost:3000/api/keys/test2" \
  -H "Content-Type: application/json" \
  -d '{"key":"your-key","region":"eastasia"}'
```

### 4. 翻译服务操作

```bash
# 获取翻译密钥
curl "http://localhost:3000/api/translation/keys/get?region=eastasia"

# 添加翻译密钥
curl -X POST "http://localhost:3000/api/translation/keys" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "your-translation-key",
    "region": "eastasia",
    "keyname": "Translation Key 1"
  }'

# 测试翻译密钥
curl -X POST "http://localhost:3000/api/translation/keys/test" \
  -H "Content-Type: application/json" \
  -d '{"key":"your-translation-key","region":"eastasia"}'
```

### 5. 批量上传管理

```bash
# 下载JSON模板
curl "http://localhost:3000/api/upload/template?type=speech" -o template.json

# 批量创建密钥
curl -X POST "http://localhost:3000/api/upload/create-keys" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonData": {...},
    "options": {
      "validateBeforeCreate": true,
      "enableAfterCreate": true,
      "overwriteExisting": false
    }
  }'

# 验证JSON格式
curl -X POST "http://localhost:3000/api/upload/validate" \
  -H "Content-Type: application/json" \
  -d '{"jsonData": {...}}'
```

### 6. 获取系统状态

```bash
# 健康检查
curl "http://localhost:3000/api/health"

# 获取所有密钥
curl "http://localhost:3000/api/keys"

# 获取统计信息
curl "http://localhost:3000/api/keys/stats"

# 系统清理状态
curl "http://localhost:3000/api/system/cleanup"
```

## 响应格式

### 成功响应
```json
{
  "success": true,
  "data": { /* 响应数据 */ },
  "message": "操作成功消息"
}
```

### 错误响应
```json
{
  "success": false,
  "error": "错误信息"
}
```

## 接口详细说明

### 1. 获取可用密钥 - GET /keys/get

**请求参数**:
- `region` (string, 可选): Azure区域，默认 'eastasia'
- `tag` (string, 可选): 密钥标签，默认为空

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "key": "your-azure-key",
    "region": "eastasia",
    "keyname": "Production Key 1",
    "status": "enabled",
    "created_at": "2024-01-01T00:00:00.000Z"
  },
  "message": "Key retrieved successfully"
}
```

### 2. 设置密钥状态 - POST /keys/status

**请求体**:
```json
{
  "key": "your-azure-key",
  "code": 200,
  "note": "API call successful"
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "action": "keep_enabled",
    "statusChanged": false
  },
  "message": "Status updated successfully"
}
```

### 3. 测试密钥 - POST /keys/test (TTS)

**请求体**:
```json
{
  "key": "your-azure-key",
  "region": "eastasia"
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "statusCode": 200,
    "audioSize": 1024,
    "statusUpdate": {
      "action": "keep_enabled",
      "statusChanged": false,
      "message": "Status updated successfully"
    }
  },
  "message": "Key test successful"
}
```

### 4. 测试密钥 - POST /keys/test2 (STT)

**请求体**:
```json
{
  "key": "your-azure-key",
  "region": "eastasia"
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "statusCode": 200,
    "transcription": "",
    "recognitionStatus": "Success",
    "rawResponse": {
      "RecognitionStatus": "Success",
      "DisplayText": "",
      "NBest": [...]
    },
    "statusUpdate": {
      "action": "keep_enabled",
      "statusChanged": false,
      "message": "Status updated successfully"
    }
  },
  "message": "Key test successful"
}
```

### 5. 获取操作日志 - GET /keys/logs

**查询参数**:
- `page` (number, 可选): 页码，默认 1
- `limit` (number, 可选): 每页数量，默认 50

**响应示例**:
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": 1,
        "key_id": 1,
        "action": "test",
        "status_code": 200,
        "note": "Key test performed",
        "created_at": "2024-01-01T00:00:00.000Z",
        "keyname": "Production Key 1",
        "region": "eastasia"
      }
    ],
    "total": 100,
    "page": 1,
    "limit": 50,
    "totalPages": 2
  },
  "message": "Logs retrieved successfully"
}
```

### 6. 获取统计信息 - GET /keys/stats

**响应示例**:
```json
{
  "success": true,
  "data": {
    "cooldown": {
      "totalKeys": 10,
      "cooldownKeys": 2,
      "enabledKeys": 7,
      "disabledKeys": 1
    },
    "cooldownKeys": [
      {
        "key": "key1***",
        "region": "eastasia",
        "cooldownUntil": "2024-01-01T00:05:00.000Z",
        "remainingSeconds": 120
      }
    ]
  },
  "message": "Statistics retrieved successfully"
}
```

## 密钥状态

- `enabled`: 启用状态，可正常使用
- `disabled`: 禁用状态，不可使用
- `cooldown`: 冷却状态，暂时不可使用

## 状态码处理规则

- `200-299`: 成功，保持启用
- `401,403,404`: 密钥无效，自动禁用
- `429`: 请求过多，进入冷却（具有保护期机制）
- 其他: 记录错误，保持当前状态

## 冷却机制说明

### 冷却触发条件
- 收到429状态码且当前密钥状态为 `enabled`
- 高频429错误只触发一次冷却，冷却期间无法重置计时器
- 冷却结束后有5秒保护期，期间忽略429错误

### 冷却恢复
- 冷却期满后自动恢复为 `enabled` 状态
- 保护期结束后可再次响应429错误

## 常用配置项

| 配置键 | 默认值 | 说明 |
|--------|--------|------|
| `cooldown_seconds` | 300 | 冷却时长（秒） |
| `disable_codes` | "401,403,404" | 禁用状态码 |
| `cooldown_codes` | "429" | 冷却状态码 |
| `max_concurrent_requests` | 10 | 最大并发数 |
| `protection_period_seconds` | 5 | 冷却后保护期（秒） |

## JavaScript SDK 示例

```javascript
class AzureKeyManager {
  constructor(baseUrl = 'http://localhost:3019/api') {
    this.baseUrl = baseUrl;
  }

  // 获取可用密钥
  async getKey(region = 'eastasia') {
    try {
      const response = await fetch(`${this.baseUrl}/keys/get?region=${region}`);
      return await response.json();
    } catch (error) {
      throw new Error(`获取密钥失败: ${error.message}`);
    }
  }

  // 报告密钥状态
  async reportStatus(key, statusCode, note = '') {
    try {
      const response = await fetch(`${this.baseUrl}/keys/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, code: statusCode, note })
      });
      return await response.json();
    } catch (error) {
      throw new Error(`报告状态失败: ${error.message}`);
    }
  }

  // 添加新密钥
  async addKey(key, region, keyname) {
    try {
      const response = await fetch(`${this.baseUrl}/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, region, keyname })
      });
      return await response.json();
    } catch (error) {
      throw new Error(`添加密钥失败: ${error.message}`);
    }
  }

  // 测试密钥（TTS方式）
  async testKeyTTS(key, region) {
    try {
      const response = await fetch(`${this.baseUrl}/keys/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, region })
      });
      return await response.json();
    } catch (error) {
      throw new Error(`TTS测试失败: ${error.message}`);
    }
  }

  // 测试密钥（STT方式）
  async testKeySTT(key, region) {
    try {
      const response = await fetch(`${this.baseUrl}/keys/test2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, region })
      });
      return await response.json();
    } catch (error) {
      throw new Error(`STT测试失败: ${error.message}`);
    }
  }

  // 获取所有密钥
  async getAllKeys() {
    try {
      const response = await fetch(`${this.baseUrl}/keys`);
      return await response.json();
    } catch (error) {
      throw new Error(`获取密钥列表失败: ${error.message}`);
    }
  }

  // 获取系统健康状态
  async getHealth() {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return await response.json();
    } catch (error) {
      throw new Error(`获取健康状态失败: ${error.message}`);
    }
  }

  // 安全地报告密钥状态（不抛出异常）
  async reportStatusSafe(key, statusCode, note = '') {
    if (statusCode === 200) {
      return { success: true };
    }

    try {
      const result = await this.reportStatus(key, statusCode, note);
      if (result && !result.success) {
        console.warn(`报告密钥状态失败: ${result.error || '未知错误'}`);
      } else {
        console.log(`报告密钥状态成功: 状态码=${statusCode}, 备注=${note}`);
      }
      return result;
    } catch (error) {
      console.error(`报告密钥状态异常: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

// 基础使用示例
const keyManager = new AzureKeyManager();

// 1. 获取并使用密钥
async function useAzureKey() {
  try {
    // 获取可用密钥
    const keyResult = await keyManager.getKey('eastasia');
    if (!keyResult.success) {
      throw new Error(`获取密钥失败: ${keyResult.error}`);
    }

    const azureKey = keyResult.data;
    console.log(`获取密钥成功: ${azureKey.key.substring(0, 8)}...`);

    // 测试密钥（TTS方式）
    const ttsResult = await keyManager.testKeyTTS(azureKey.key, azureKey.region);
    console.log('TTS测试结果:', ttsResult);

    // 测试密钥（STT方式）
    const sttResult = await keyManager.testKeySTT(azureKey.key, azureKey.region);
    console.log('STT测试结果:', sttResult);

    // 使用密钥调用Azure API
    const apiResult = await callAzureAPI(azureKey.key, azureKey.region);

    // 报告成功
    await keyManager.reportStatusSafe(azureKey.key, 200, 'API调用成功');

    return apiResult;
  } catch (error) {
    console.error('使用密钥失败:', error.message);
    // 报告失败（如果有密钥的话）
    if (azureKey) {
      await keyManager.reportStatusSafe(azureKey.key, error.status || 500, error.message);
    }
    throw error;
  }
}

// 2. 高并发场景使用示例（参考Python版本的全局密钥管理）
class GlobalKeyManager {
  constructor(baseUrl = 'http://localhost:3019/api') {
    this.keyManager = new AzureKeyManager(baseUrl);
    this.currentKey = null;
    this.updateInterval = null;
    this.isUpdating = false;
  }

  // 启动定期更新密钥
  startPeriodicUpdate() {
    if (this.updateInterval) return;

    this.updateInterval = setInterval(async () => {
      if (this.isUpdating) return;
      this.isUpdating = true;

      try {
        const result = await this.keyManager.getKey();
        if (result.success && result.data) {
          const oldKey = this.currentKey;
          this.currentKey = result.data;

          if (!oldKey || oldKey.key !== this.currentKey.key) {
            console.log(`全局密钥更新: ${this.currentKey.key.substring(0, 8)}...`);
          }
        }
      } catch (error) {
        console.error('定期更新密钥失败:', error.message);
      } finally {
        this.isUpdating = false;
      }
    }, 500); // 每0.5秒更新一次
  }

  // 获取当前可用密钥
  getCurrentKey() {
    return this.currentKey;
  }

  // 停止定期更新
  stopPeriodicUpdate() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
}

// 全局密钥管理器使用示例
const globalKeyManager = new GlobalKeyManager();
globalKeyManager.startPeriodicUpdate();

// 在高并发场景中使用
async function useGlobalKey() {
  const keyData = globalKeyManager.getCurrentKey();
  if (!keyData) {
    throw new Error('全局密钥未初始化');
  }

  try {
    // 使用全局密钥调用API
    const result = await callAzureAPI(keyData.key, keyData.region);

    // 报告成功
    await keyManager.reportStatusSafe(keyData.key, 200, 'API调用成功');
    return result;
  } catch (error) {
    // 报告失败
    await keyManager.reportStatusSafe(keyData.key, error.status || 500, error.message);
    throw error;
  }
}
```

## Python SDK 示例

```python
import requests
import json
import threading
import time

class AzureKeyManager:
    """Azure Key Manager API客户端 - 支持全局key管理"""

    # 类变量 - 存储当前可用的key
    current_key = None
    _update_thread = None
    _stop_update = False
    _lock = threading.Lock()
    _last_update_time = 0

    def __init__(self, base_url='http://localhost:3019/api'):
        self.base_url = base_url
        self.proxies = {'http': None, 'https': None}

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
            response = requests.get(f'{self.base_url}/keys/get',
                                  params={'region': region},
                                  timeout=10,
                                  proxies=self.proxies)
            return response.json()
        except Exception as e:
            print(f"获取密钥失败: {e}")
            return {'success': False, 'error': str(e)}

    def report_status(self, key, status_code, note=''):
        """报告密钥使用状态"""
        try:
            data = {'key': key, 'code': status_code, 'note': note}
            response = requests.post(f'{self.base_url}/keys/status',
                                   json=data,
                                   timeout=10,
                                   proxies=self.proxies)
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

            # 等待0.5秒
            time.sleep(0.5)

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
                pass  # 静默处理失败
            else:
                print(f"报告密钥状态成功 [{key_abbr}]: 状态码={status_code}, 备注={note}")
            return result
        except Exception as e:
            print(f"报告密钥状态异常 [{key_abbr}]: {e}")
            return {'success': False, 'error': str(e)}

    def add_key(self, key, region, keyname):
        """添加新密钥"""
        try:
            data = {'key': key, 'region': region, 'keyname': keyname}
            response = requests.post(f'{self.base_url}/keys', json=data, timeout=10)
            return response.json()
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def test_key_tts(self, key, region):
        """测试密钥（TTS方式）"""
        try:
            data = {'key': key, 'region': region}
            response = requests.post(f'{self.base_url}/keys/test', json=data, timeout=30)
            return response.json()
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def test_key_stt(self, key, region):
        """测试密钥（STT方式）"""
        try:
            data = {'key': key, 'region': region}
            response = requests.post(f'{self.base_url}/keys/test2', json=data, timeout=30)
            return response.json()
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def get_all_keys(self):
        """获取所有密钥"""
        try:
            response = requests.get(f'{self.base_url}/keys', timeout=10)
            return response.json()
        except Exception as e:
            return {'success': False, 'error': str(e)}

def get_key_abbreviation(key):
    """生成密钥简写，用于日志显示"""
    if not key or len(key) < 8:
        return key
    return f"{key[:4]}...{key[-4:]}"

# 全局Key Manager实例
key_manager = AzureKeyManager()

# 基础使用示例
def basic_usage_example():
    """基础使用示例"""
    key_manager = AzureKeyManager()

    # 方式1：直接获取密钥
    result = key_manager.get_key('eastasia')
    if result['success']:
        azure_key = result['data']

        try:
            # 测试密钥（TTS方式）
            tts_result = key_manager.test_key_tts(azure_key['key'], azure_key['region'])
            print('TTS测试结果:', tts_result)

            # 测试密钥（STT方式）
            stt_result = key_manager.test_key_stt(azure_key['key'], azure_key['region'])
            print('STT测试结果:', stt_result)

            # 使用密钥调用Azure API
            api_result = call_azure_api(azure_key['key'], azure_key['region'])

            # 报告成功
            key_manager.report_key_status_safe(azure_key['key'], 200, 'API调用成功')
        except Exception as e:
            # 报告失败
            key_manager.report_key_status_safe(azure_key['key'], getattr(e, 'status', 500), str(e))

# 高并发场景使用示例（推荐）
def high_concurrency_usage_example():
    """高并发场景使用示例 - 使用全局密钥管理"""

    def call_azure_speech_api():
        """调用Azure语音API的示例函数"""
        try:
            # 获取全局密钥（支持重试）
            azure_key_info = AzureKeyManager.get_azure_key_with_retry()
            if not azure_key_info:
                raise Exception("无法获取可用的Azure密钥")

            azure_key = azure_key_info['key']
            azure_region = azure_key_info['region']
            key_abbr = get_key_abbreviation(azure_key)

            # 构建Azure API请求
            endpoint = f"https://{azure_region}.cognitiveservices.azure.com/sts/v1.0/issuetoken"
            headers = {
                'Ocp-Apim-Subscription-Key': azure_key,
                'Content-Type': 'application/x-www-form-urlencoded'
            }

            # 发送请求
            response = requests.post(endpoint, headers=headers, timeout=30)
            status_code = response.status_code

            if status_code == 429:
                # 请求过多，报告429状态
                error_msg = "请求过多 (429)"
                result = key_manager.report_key_status_safe(azure_key, 429, "Rate limit exceeded")
                if result and result.get('success'):
                    print(f"请求过多 [{key_abbr}]: 密钥已设置为429状态")
                return {'success': False, 'error': error_msg}

            elif status_code in [401, 403, 404]:
                # 密钥无效
                error_msg = f"密钥无效 ({status_code})"
                key_manager.report_key_status_safe(azure_key, status_code, f"Key invalid: {status_code}")
                print(f"密钥无效 [{key_abbr}]: 状态码={status_code}")
                return {'success': False, 'error': error_msg}

            elif 200 <= status_code < 300:
                # 成功
                print(f"API调用成功 [{key_abbr}]: 状态码={status_code}")
                key_manager.report_key_status_safe(azure_key, 200, "API call successful")
                return {'success': True, 'data': response.text}

            else:
                # 其他错误
                error_msg = f"HTTP错误 ({status_code})"
                key_manager.report_key_status_safe(azure_key, status_code, f"HTTP error: {status_code}")
                return {'success': False, 'error': error_msg}

        except requests.exceptions.Timeout:
            error_msg = "请求超时"
            if azure_key_info:
                key_manager.report_key_status_safe(azure_key_info['key'], 408, "Request timeout")
            return {'success': False, 'error': error_msg}

        except Exception as e:
            error_msg = f"意外错误: {str(e)}"
            if azure_key_info:
                key_manager.report_key_status_safe(azure_key_info['key'], 500, f"Unexpected error: {str(e)[:100]}")
            return {'success': False, 'error': error_msg}

    # 调用示例
    result = call_azure_speech_api()
    if result['success']:
        print("API调用成功:", result['data'])
    else:
        print("API调用失败:", result['error'])

# 多线程并发测试示例
def concurrent_test_example():
    """多线程并发测试示例"""
    import threading
    import time

    def worker_thread(thread_id, results):
        """工作线程函数"""
        for i in range(10):  # 每个线程发送10个请求
            try:
                # 获取全局密钥
                azure_key_info = AzureKeyManager.get_azure_key_with_retry()
                if not azure_key_info:
                    results.append(f"线程{thread_id}-请求{i}: 获取密钥失败")
                    continue

                # 模拟API调用
                time.sleep(0.1)  # 模拟API调用时间

                # 报告成功
                key_manager.report_key_status_safe(azure_key_info['key'], 200, f"Thread{thread_id}-Request{i}")
                results.append(f"线程{thread_id}-请求{i}: 成功")

            except Exception as e:
                results.append(f"线程{thread_id}-请求{i}: 失败 - {str(e)}")

    # 启动多个线程
    threads = []
    results = []

    for i in range(5):  # 5个并发线程
        thread = threading.Thread(target=worker_thread, args=(i, results))
        threads.append(thread)
        thread.start()

    # 等待所有线程完成
    for thread in threads:
        thread.join()

    # 打印结果
    for result in results:
        print(result)
```

## 注意事项

1. **生产环境**: 建议添加认证和HTTPS
2. **错误处理**: 始终检查响应的 `success` 字段
3. **状态报告**: 及时报告API调用结果以维护密钥状态
4. **监控**: 定期检查系统健康状态和密钥统计
5. **备份**: 为每个区域准备多个密钥确保高可用性
6. **测试方式**:
   - 使用 `/keys/test` 进行TTS测试（文本转语音）
   - 使用 `/keys/test2` 进行STT测试（语音转文本）
7. **冷却机制**: 理解429错误的冷却和保护期机制，避免频繁触发
8. **并发安全**: 系统使用Redis确保高并发环境下的线程安全

## 更新日志

### v1.0.0 (最新)
- ✅ 新增 `POST /keys/test2` STT测试接口
- ✅ 优化日志接口分页参数（`page`/`limit` 替代 `offset`）
- ✅ 增强冷却机制，支持保护期功能
- ✅ 改进统计接口，提供更详细的冷却状态信息
- ✅ 完善错误处理和状态管理逻辑
- ✅ 支持Redis高并发冷却管理
