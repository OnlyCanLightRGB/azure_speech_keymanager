// 使用Node.js内置的fetch API (Node.js 18+)

interface FeishuPayload {
  msg_type: string;
  content: {
    text: string;
  };
}

async function testFeishuNotification(): Promise<boolean> {
  const webhookUrl: string = 'https://open.feishu.cn/open-apis/bot/v2/hook/94a7f77f-dc0d-4439-8ca5-d070c45fa05a';
  
  const payload: FeishuPayload = {
    msg_type: 'text',
    content: {
      text: '🧪 飞书通知测试\n\n这是一条来自Azure Speech Key Manager的测试通知。\n\n时间: ' + new Date().toLocaleString('zh-CN')
    }
  };

  try {
    console.log('正在发送测试通知到飞书...');
    console.log('Webhook URL:', webhookUrl);
    console.log('Payload:', JSON.stringify(payload, null, 2));
    
    const response: Response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    const responseText: string = await response.text();
    
    console.log('Response Status:', response.status);
    console.log('Response Headers:', Object.fromEntries(response.headers.entries()));
    console.log('Response Body:', responseText);

    if (response.ok) {
      console.log('✅ 飞书通知发送成功！');
      return true;
    } else {
      console.log('❌ 飞书通知发送失败');
      return false;
    }
  } catch (error: unknown) {
    console.error('❌ 发送飞书通知时出错:', error);
    return false;
  }
}

// 运行测试
testFeishuNotification().then((success: boolean) => {
  process.exit(success ? 0 : 1);
});