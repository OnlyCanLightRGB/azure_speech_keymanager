-- 更新飞书通知模板为正确的中文内容
UPDATE system_config 
SET config_value = '🚨 Azure密钥401错误警报

密钥ID: {keyId}
密钥名称: {keyName}
服务类型: {service}
错误时间: {timestamp}

该密钥已被自动禁用，请检查密钥状态并及时更换。'
WHERE config_key = 'feishu_notification_template';
