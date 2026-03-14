const https = require('https');

const token = 'VRYxT1vYCEkO77CWDRvfIdCaK/HbDV4LssBah7dIhi14RDD074NUAoB16MyHSUgrrQy6rBx0ZQtdd3qUYtQA36B3fEh6okg0D/1uKyYyh3TcyJMLzNUrZUSSo/to/PPyuyddlEIQDLnAPa9eLSf7JwdB04t89/1O/w1cDnyilFU=';
const endpoint = 'https://120.24.31.121:31443/bot/webhook';

const postData = JSON.stringify({
  endpoint: endpoint
});

console.log('='.repeat(70));
console.log('LINE Webhook 测试接口调用');
console.log('='.repeat(70));
console.log(`目标端点: ${endpoint}`);
console.log('='.repeat(70));

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

console.log('\n请求详情:');
console.log(`URL: https://api.line.me/v2/bot/channel/webhook/test`);
console.log(`Method: POST`);
console.log(`Body: ${postData}`);
console.log('\n发送请求...\n');

const req = https.request(options, (res) => {
  console.log(`响应状态码: ${res.statusCode}`);
  console.log(`响应头: ${JSON.stringify(res.headers, null, 2)}`);
  
  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });
  
  res.on('end', () => {
    console.log('\n响应体:');
    try {
      const json = JSON.parse(body);
      console.log(JSON.stringify(json, null, 2));
      
      console.log('\n' + '='.repeat(70));
      console.log('结果分析');
      console.log('='.repeat(70));
      
      if (res.statusCode === 200) {
        console.log('✅ 请求成功');
        if (json.success) {
          console.log('✅ Webhook 测试成功');
        } else {
          console.log('❌ Webhook 测试失败');
          if (json.detail) {
            console.log(`详情: ${json.detail}`);
          }
        }
      } else {
        console.log('❌ 请求失败');
        if (json.message) {
          console.log(`错误信息: ${json.message}`);
        }
      }
    } catch (e) {
      console.log(body);
    }
  });
});

req.on('error', (error) => {
  console.error('请求错误:', error.message);
});

req.write(postData);
req.end();
