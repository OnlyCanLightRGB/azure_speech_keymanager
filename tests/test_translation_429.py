#!/usr/bin/env python3
import requests
import json
import time

# 翻译密钥信息
key = 'YOUR_TRANSLATION_KEY_HERE'
region = 'eastasia'

print("开始测试翻译服务429限制...")
print("发送快速连续请求以触发限制")

for i in range(100):
    try:
        response = requests.post(
            'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=en&to=zh-Hans',
            headers={
                'Ocp-Apim-Subscription-Key': key,
                'Ocp-Apim-Subscription-Region': region,
                'Content-Type': 'application/json'
            },
            json=[{'text': 'Hello world'}],
            timeout=10
        )
        print(f'请求 {i+1}: 状态码 {response.status_code}')
        
        if response.status_code == 429:
            print(f"触发429限制！在第{i+1}个请求")
            print(f"响应内容: {response.text}")
            
            # 报告状态到后端
            status_data = {'key': key, 'code': 429, 'note': 'Rate limit exceeded in test'}
            status_response = requests.post('http://localhost:3019/api/translation/keys/status', json=status_data, timeout=10)
            print(f"状态报告结果: {status_response.json()}")
            break
        elif response.status_code != 200:
            print(f"意外状态码: {response.status_code}, 响应: {response.text}")
            
        # 短暂延迟
        time.sleep(0.05)
        
    except Exception as e:
        print(f"请求 {i+1} 异常: {e}")
        break

print("测试完成")