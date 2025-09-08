import requests
import json
import time
import random
import string
from typing import Dict, Any, Optional

class AzureTranslatorSetup:
    def __init__(self, client_id: str, client_secret: str, tenant_id: str):
        self.client_id = client_id
        self.client_secret = client_secret
        self.tenant_id = tenant_id
        self.access_token = None
        self.subscription_id = None
        
    def get_access_token(self) -> str:
        """获取 Azure 管理 API 访问令牌"""
        token_url = f"https://login.microsoftonline.com/{self.tenant_id}/oauth2/v2.0/token"
        
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        data = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "scope": "https://management.azure.com/.default",
            "grant_type": "client_credentials"
        }
        
        try:
            response = requests.post(token_url, headers=headers, data=data)
            response.raise_for_status()
            
            token_data = response.json()
            self.access_token = token_data["access_token"]
            print("✅ Azure AD 访问令牌获取成功")
            return self.access_token
            
        except requests.exceptions.RequestException as e:
            raise Exception(f"❌ 获取访问令牌失败: {e}")
    
    def get_subscriptions(self) -> list:
        """获取可用的订阅列表"""
        if not self.access_token:
            self.get_access_token()

        url = "https://management.azure.com/subscriptions?api-version=2020-01-01"
        headers = {"Authorization": f"Bearer {self.access_token}"}

        try:
            response = requests.get(url, headers=headers)
            print(f"🔍 订阅API响应状态码: {response.status_code}")
            print(f"🔍 订阅API响应内容: {response.text}")
            response.raise_for_status()

            response_data = response.json()
            subscriptions = response_data.get("value", [])
            print(f"✅ 找到 {len(subscriptions)} 个可用订阅:")

            for i, sub in enumerate(subscriptions):
                print(f"  {i+1}. {sub['displayName']} ({sub['subscriptionId']})")

            return subscriptions

        except requests.exceptions.RequestException as e:
            print(f"🔍 请求异常详情: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"🔍 错误响应状态码: {e.response.status_code}")
                print(f"🔍 错误响应内容: {e.response.text}")
            raise Exception(f"❌ 获取订阅列表失败: {e}")
    
    def create_resource_group(self, subscription_id: str, resource_group_name: str, 
                            location: str = "East US") -> Dict[str, Any]:
        """创建资源组"""
        url = f"https://management.azure.com/subscriptions/{subscription_id}/resourcegroups/{resource_group_name}?api-version=2021-04-01"
        
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        
        data = {
            "location": location,
            "tags": {
                "purpose": "translator-api",
                "created-by": "automated-script"
            }
        }
        
        try:
            # 先检查资源组是否已存在
            response = requests.get(url, headers=headers)
            if response.status_code == 200:
                print(f"✅ 资源组 '{resource_group_name}' 已存在")
                return response.json()
            
            # 创建新资源组
            response = requests.put(url, headers=headers, json=data)
            response.raise_for_status()
            
            print(f"✅ 资源组 '{resource_group_name}' 创建成功")
            return response.json()
            
        except requests.exceptions.RequestException as e:
            raise Exception(f"❌ 创建资源组失败: {e}")
    
    def create_translator_resource(self, subscription_id: str, resource_group_name: str, 
                                 translator_name: str, location: str = "global") -> Dict[str, Any]:
        """创建翻译器认知服务资源"""
        url = f"https://management.azure.com/subscriptions/{subscription_id}/resourceGroups/{resource_group_name}/providers/Microsoft.CognitiveServices/accounts/{translator_name}?api-version=2023-05-01"
        
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        
        data = {
            "location": location,
            "sku": {
                "name": "S1"  # 免费层
            },
            "kind": "TextTranslation",
            "properties": {
                "customSubDomainName": translator_name,
                "publicNetworkAccess": "Enabled"
            },
            "tags": {
                "purpose": "text-translation",
                "created-by": "automated-script"
            }
        }
        
        try:
            response = requests.put(url, headers=headers, json=data)
            print(f"🔍 创建翻译器资源响应状态码: {response.status_code}")
            print(f"🔍 创建翻译器资源响应内容: {response.text}")
            response.raise_for_status()
            
            print(f"✅ 翻译器资源 '{translator_name}' 创建成功")
            print("⏳ 等待资源部署完成...")
            
            # 等待资源创建完成
            time.sleep(30)
            return response.json()
            
        except requests.exceptions.RequestException as e:
            error_text = str(e)
            if hasattr(e, 'response') and e.response is not None:
                error_text = e.response.text

            if ("409" in str(e) or "already exists" in error_text.lower() or
                "conflict" in error_text.lower()):
                print(f"✅ 翻译器资源 '{translator_name}' 已存在")
                return {"name": translator_name}
            elif "CanNotCreateMultipleFreeAccounts" in error_text:
                print(f"⚠️  免费账户限制：每种类型只能有一个免费账户")
                print(f"🔍 尝试查找现有的翻译器资源...")
                existing_resource = self.find_existing_translator_resource(self.subscription_id)
                if existing_resource:
                    print(f"✅ 找到现有翻译器资源，将使用: {existing_resource['name']}")
                    return existing_resource
                else:
                    raise Exception(f"❌ 无法创建新的免费翻译器资源，且未找到现有资源")

            print(f"🔍 创建翻译器资源详细错误: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"🔍 错误响应状态码: {e.response.status_code}")
                print(f"🔍 错误响应内容: {e.response.text}")
            raise Exception(f"❌ 创建翻译器资源失败: {e}")
    
    def check_provider_registration(self, subscription_id: str, provider_namespace: str) -> bool:
        """检查资源提供程序是否已注册"""
        url = f"https://management.azure.com/subscriptions/{subscription_id}/providers/{provider_namespace}?api-version=2021-04-01"

        headers = {"Authorization": f"Bearer {self.access_token}"}

        try:
            response = requests.get(url, headers=headers)
            response.raise_for_status()

            provider_info = response.json()
            status = provider_info.get("registrationState", "Unknown")
            print(f"📊 提供程序 {provider_namespace} 状态: {status}")
            return status == "Registered"

        except requests.exceptions.RequestException as e:
            print(f"❌ 检查提供程序状态失败: {e}")
            return False

    def register_provider_if_needed(self, subscription_id: str, provider_namespace: str) -> bool:
        """如果需要，注册资源提供程序"""
        print(f"🔍 检查提供程序注册状态: {provider_namespace}")

        if self.check_provider_registration(subscription_id, provider_namespace):
            print(f"✅ 提供程序 {provider_namespace} 已注册")
            return True

        print(f"🔄 正在注册提供程序: {provider_namespace}")
        url = f"https://management.azure.com/subscriptions/{subscription_id}/providers/{provider_namespace}/register?api-version=2021-04-01"

        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }

        try:
            response = requests.post(url, headers=headers)
            response.raise_for_status()

            print(f"✅ 提供程序 {provider_namespace} 注册请求已提交")

            # 等待注册完成
            for i in range(30):  # 最多等待5分钟
                if self.check_provider_registration(subscription_id, provider_namespace):
                    print(f"✅ 提供程序 {provider_namespace} 注册完成!")
                    return True
                if i < 29:
                    print(f"⏳ 等待注册完成... ({i+1}/30)")
                    time.sleep(10)

            print(f"⏰ 提供程序 {provider_namespace} 注册超时，但可能仍在进行中")
            return False

        except requests.exceptions.RequestException as e:
            print(f"❌ 注册提供程序失败: {e}")
            return False

    def find_existing_translator_resource(self, subscription_id: str) -> Optional[Dict[str, Any]]:
        """查找现有的翻译器资源"""
        url = f"https://management.azure.com/subscriptions/{subscription_id}/providers/Microsoft.CognitiveServices/accounts?api-version=2023-05-01"

        headers = {"Authorization": f"Bearer {self.access_token}"}

        try:
            response = requests.get(url, headers=headers)
            response.raise_for_status()

            accounts = response.json().get("value", [])

            # 查找翻译器类型的资源
            for account in accounts:
                if account.get("kind") == "TextTranslation":
                    resource_name = account["name"]
                    resource_group = account["id"].split("/resourceGroups/")[1].split("/")[0]
                    print(f"🔍 找到翻译器资源: {resource_name} (资源组: {resource_group})")
                    return {
                        "name": resource_name,
                        "resource_group": resource_group,
                        "id": account["id"],
                        "location": account["location"]
                    }

            print("❌ 未找到现有的翻译器资源")
            return None

        except requests.exceptions.RequestException as e:
            print(f"❌ 查找现有翻译器资源失败: {e}")
            return None

    def check_translator_resource(self, subscription_id: str, resource_group_name: str,
                                translator_name: str) -> bool:
        """检查翻译器资源是否存在"""
        url = f"https://management.azure.com/subscriptions/{subscription_id}/resourceGroups/{resource_group_name}/providers/Microsoft.CognitiveServices/accounts/{translator_name}?api-version=2023-05-01"

        headers = {"Authorization": f"Bearer {self.access_token}"}

        try:
            response = requests.get(url, headers=headers)
            print(f"🔍 检查资源存在性状态码: {response.status_code}")
            if response.status_code == 200:
                print(f"✅ 翻译器资源 '{translator_name}' 确实存在")
                return True
            else:
                print(f"❌ 翻译器资源 '{translator_name}' 不存在")
                print(f"🔍 检查资源响应: {response.text}")
                return False
        except Exception as e:
            print(f"🔍 检查资源存在性错误: {e}")
            return False

    def get_translator_keys(self, subscription_id: str, resource_group_name: str,
                          translator_name: str) -> Dict[str, Any]:
        """获取翻译器资源的访问密钥"""
        url = f"https://management.azure.com/subscriptions/{subscription_id}/resourceGroups/{resource_group_name}/providers/Microsoft.CognitiveServices/accounts/{translator_name}/listKeys?api-version=2023-05-01"
        
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        
        try:
            response = requests.post(url, headers=headers)
            response.raise_for_status()
            
            keys = response.json()
            print(f"✅ 翻译器密钥获取成功")
            return keys
            
        except requests.exceptions.RequestException as e:
            raise Exception(f"❌ 获取翻译器密钥失败: {e}")
    
    def get_translator_endpoint(self, subscription_id: str, resource_group_name: str, 
                              translator_name: str) -> str:
        """获取翻译器资源的终结点"""
        url = f"https://management.azure.com/subscriptions/{subscription_id}/resourceGroups/{resource_group_name}/providers/Microsoft.CognitiveServices/accounts/{translator_name}?api-version=2023-05-01"
        
        headers = {"Authorization": f"Bearer {self.access_token}"}
        
        try:
            response = requests.get(url, headers=headers)
            response.raise_for_status()
            
            resource_info = response.json()
            endpoint = resource_info["properties"]["endpoint"]
            print(f"✅ 翻译器终结点: {endpoint}")
            return endpoint
            
        except requests.exceptions.RequestException as e:
            raise Exception(f"❌ 获取翻译器终结点失败: {e}")

    def check_storage_account_availability(self, storage_account_name: str) -> bool:
        """检查存储账户名称是否可用"""
        url = "https://management.azure.com/subscriptions/{}/providers/Microsoft.Storage/checkNameAvailability?api-version=2023-01-01".format(self.subscription_id)

        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }

        data = {
            "name": storage_account_name,
            "type": "Microsoft.Storage/storageAccounts"
        }

        try:
            response = requests.post(url, headers=headers, json=data)
            response.raise_for_status()

            result = response.json()
            available = result.get("nameAvailable", False)
            if not available:
                reason = result.get("reason", "Unknown")
                message = result.get("message", "")
                print(f"❌ 存储账户名称 '{storage_account_name}' 不可用: {reason} - {message}")
            else:
                print(f"✅ 存储账户名称 '{storage_account_name}' 可用")
            return available

        except requests.exceptions.RequestException as e:
            print(f"❌ 检查存储账户名称可用性失败: {e}")
            return False

    def create_storage_account_if_needed(self, subscription_id: str, resource_group_name: str,
                                       storage_account_name: str, location: str = "East US") -> Optional[Dict[str, Any]]:
        """如果需要，创建存储账户（某些认知服务功能可能需要）"""

        # 检查存储账户是否已存在
        check_url = f"https://management.azure.com/subscriptions/{subscription_id}/resourceGroups/{resource_group_name}/providers/Microsoft.Storage/storageAccounts/{storage_account_name}?api-version=2023-01-01"
        headers = {"Authorization": f"Bearer {self.access_token}"}

        try:
            response = requests.get(check_url, headers=headers)
            if response.status_code == 200:
                print(f"✅ 存储账户 '{storage_account_name}' 已存在")
                return response.json()
        except:
            pass

        print(f"🔧 创建存储账户: {storage_account_name}")

        # 检查名称可用性
        if not self.check_storage_account_availability(storage_account_name):
            print(f"⚠️  存储账户名称不可用，跳过创建")
            return None

        url = f"https://management.azure.com/subscriptions/{subscription_id}/resourceGroups/{resource_group_name}/providers/Microsoft.Storage/storageAccounts/{storage_account_name}?api-version=2023-01-01"

        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }

        data = {
            "location": location,
            "sku": {
                "name": "Standard_LRS"  # 本地冗余存储，最便宜的选项
            },
            "kind": "StorageV2",
            "properties": {
                "accessTier": "Hot",
                "allowBlobPublicAccess": False,
                "minimumTlsVersion": "TLS1_2"
            },
            "tags": {
                "purpose": "cognitive-services-support",
                "created-by": "automated-script"
            }
        }

        try:
            response = requests.put(url, headers=headers, json=data)
            print(f"🔍 创建存储账户响应状态码: {response.status_code}")

            if response.status_code in [200, 201, 202]:
                print(f"✅ 存储账户 '{storage_account_name}' 创建成功")
                print("⏳ 等待存储账户部署完成...")
                time.sleep(15)  # 存储账户创建通常比较快
                return response.json()
            else:
                print(f"⚠️  存储账户创建可能失败: {response.text}")
                return None

        except requests.exceptions.RequestException as e:
            print(f"⚠️  创建存储账户失败（可选功能）: {e}")
            return None

    def setup_complete_translator(self, resource_group_name: str = "translator-rg",
                                translator_name: str = "my-translator", 
                                location: str = "East US"):
        """完整的翻译器设置流程"""
        try:
            print("🚀 开始设置 Azure 翻译器资源...")

            # 1. 获取访问令牌
            self.get_access_token()

            # 2. 获取订阅
            subscriptions = self.get_subscriptions()
            if not subscriptions:
                raise Exception("❌ 没有可用的订阅")

            # 使用第一个可用订阅
            self.subscription_id = subscriptions[0]["subscriptionId"]
            print(f"📋 使用订阅: {subscriptions[0]['displayName']}")

            # 3. 检查并注册必要的资源提供程序
            print("🔧 检查资源提供程序注册状态...")
            required_providers = [
                "Microsoft.CognitiveServices",
                "Microsoft.Storage"  # 某些认知服务功能可能需要
            ]

            for provider in required_providers:
                self.register_provider_if_needed(self.subscription_id, provider)

            # 4. 创建资源组
            print(f"📁 创建/检查资源组: {resource_group_name}")
            self.create_resource_group(self.subscription_id, resource_group_name, location)

            # 5. 可选：创建存储账户（某些高级功能可能需要）
            storage_account_name = translator_name.replace("-", "").lower() + "storage"
            if len(storage_account_name) > 24:
                storage_account_name = storage_account_name[:24]

            print(f"💾 检查/创建存储账户: {storage_account_name}")
            self.create_storage_account_if_needed(self.subscription_id, resource_group_name, storage_account_name, location)

            # 6. 创建翻译器资源
            print(f"🔧 创建翻译器资源: {translator_name}")
            resource_result = self.create_translator_resource(self.subscription_id, resource_group_name, translator_name)

            # 如果返回的是现有资源信息，更新资源组和名称
            if isinstance(resource_result, dict) and "resource_group" in resource_result:
                actual_resource_group = resource_result["resource_group"]
                actual_translator_name = resource_result["name"]
                print(f"📋 使用现有资源: {actual_translator_name} (资源组: {actual_resource_group})")
            else:
                actual_resource_group = resource_group_name
                actual_translator_name = translator_name

            # 7. 检查资源是否真的存在
            print("🔍 检查翻译器资源状态...")
            if not self.check_translator_resource(self.subscription_id, actual_resource_group, actual_translator_name):
                raise Exception("❌ 翻译器资源创建后无法找到，可能需要等待更长时间")

            # 8. 获取访问密钥
            print("🔑 获取访问密钥...")
            keys = self.get_translator_keys(self.subscription_id, actual_resource_group, actual_translator_name)

            # 9. 获取终结点
            print("🌐 获取服务终结点...")
            endpoint = self.get_translator_endpoint(self.subscription_id, actual_resource_group, actual_translator_name)
            
            # 输出完整配置信息
            print("\n" + "="*60)
            print("🎉 Azure 翻译器资源设置完成!")
            print("="*60)
            print(f"订阅 ID: {self.subscription_id}")
            print(f"资源组: {actual_resource_group}")
            print(f"翻译器名称: {actual_translator_name}")
            print(f"区域: global")
            print(f"终结点: {endpoint}")
            print(f"主密钥: {keys['key1']}")
            print(f"备用密钥: {keys['key2']}")
            print("="*60)

            # 返回配置信息
            return {
                "subscription_id": self.subscription_id,
                "resource_group": actual_resource_group,
                "translator_name": actual_translator_name,
                "endpoint": endpoint,
                "key1": keys["key1"],
                "key2": keys["key2"],
                "region": "global"
            }
            
        except Exception as e:
            print(f"❌ 设置过程中出错: {e}")
            raise

def main():
    # Azure 服务主体凭据
    client_id = "YOUR_CLIENT_ID_HERE"
    client_secret = "YOUR_CLIENT_SECRET_HERE"
    tenant_id = "YOUR_TENANT_ID_HERE"

    # 生成随机后缀避免名称冲突
    random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    translator_name = f"translator-{random_suffix}"
    resource_group_name = f"translator-rg-{random_suffix}"

    print(f"🎲 生成的资源名称:")
    print(f"   资源组: {resource_group_name}")
    print(f"   翻译器: {translator_name}")

    # 创建设置实例
    setup = AzureTranslatorSetup(client_id, client_secret, tenant_id)

    # 执行完整设置
    config = setup.setup_complete_translator(
        resource_group_name=resource_group_name,
        translator_name=translator_name,
        location="East US"
    )
    
    # 保存配置到文件
    with open("tests/azure_translator_config.json", "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
    
    print(f"\n💾 配置信息已保存到: azure_translator_config.json")

if __name__ == "__main__":
    main()