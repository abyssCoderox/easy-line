const https = require('https');

const token = 'VRYxT1vYCEkO77CWDRvfIdCaK/HbDV4LssBah7dIhi14RDD074NUAoB16MyHSUgrrQy6rBx0ZQtdd3qUYtQA36B3fEh6okg0D/1uKyYyh3TcyJMLzNUrZUSSo/to/PPyuyddlEIQDLnAPa9eLSf7JwdB04t89/1O/w1cDnyilFU=';

const endpoints = [
  'https://120.24.31.121:31443/bot/webhook',
  'https://abysshaven.online:31443/bot/webhook',
];

console.log('='.repeat(70));
console.log('LINE Webhook 测试 - IP vs 域名对比');
console.log('='.repeat(70));

async function testEndpoint(endpoint) {
  return new Promise((resolve) => {
    console.log(`\n测试端点: ${endpoint}`);
    console.log('-'.repeat(50));

    const postData = JSON.stringify({ endpoint });

    const options = {
      hostname: 'api.line.me',
      port: 443,
      path: '/v2/bot/channel/webhook/test',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          console.log(`状态码: ${res.statusCode}`);
          console.log(`成功: ${json.success ? '✅' : '❌'}`);
          if (!json.success) {
            console.log(`原因: ${json.reason}`);
            console.log(`详情: ${json.detail}`);
          }
          resolve(json);
        } catch (e) {
          console.log(`响应: ${body}`);
          resolve(null);
        }
      });
    });

    req.on('error', (error) => {
      console.log(`错误: ${error.message}`);
      resolve(null);
    });

    req.write(postData);
    req.end();
  });
}

async function main() {
  for (const endpoint of endpoints) {
    await testEndpoint(endpoint);
  }

  console.log('\n' + '='.repeat(70));
  console.log('结论');
  console.log('='.repeat(70));
  console.log(`
IP地址测试失败原因:
  - SSL证书颁发给域名 (abysshaven.online)
  - 证书不包含IP地址
  - LINE服务器验证证书时会失败

解决方案:
  ✅ 使用域名作为 webhook URL
  ✅ 在 LINE Developers 控制台配置域名地址
  ❌ 不要使用 IP 地址
`);
}

main();
