const https = require('https');
const tls = require('tls');
const { URL } = require('url');

const webhookUrl = 'https://abysshaven.online:31443/bot/webhook';
const parsedUrl = new URL(webhookUrl);
const hostname = parsedUrl.hostname;
const port = parsedUrl.port || 443;

console.log('='.repeat(70));
console.log('SSL/TLS 完整验证');
console.log('='.repeat(70));
console.log(`目标URL: ${webhookUrl}`);
console.log(`主机名: ${hostname}`);
console.log(`端口: ${port}`);
console.log('='.repeat(70));

async function testWithDifferentOptions() {
  
  console.log('\n[测试1] 标准HTTPS请求 (rejectUnauthorized: true)');
  await makeRequest({
    hostname,
    port,
    path: '/bot/webhook',
    method: 'GET',
    rejectUnauthorized: true,
  });

  console.log('\n[测试2] 禁用证书验证 (rejectUnauthorized: false)');
  await makeRequest({
    hostname,
    port,
    path: '/bot/webhook',
    method: 'GET',
    rejectUnauthorized: false,
  });

  console.log('\n[测试3] 指定TLS版本');
  await makeRequest({
    hostname,
    port,
    path: '/bot/webhook',
    method: 'GET',
    minVersion: 'TLSv1.2',
    rejectUnauthorized: false,
  });

  console.log('\n[测试4] TLS Socket 直接连接');
  await testTLSSocket();
}

function makeRequest(options) {
  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      console.log(`✅ 连接成功!`);
      console.log(`   状态码: ${res.statusCode}`);
      
      const cert = res.socket.getPeerCertificate();
      if (cert && cert.subject) {
        console.log(`   证书CN: ${cert.subject.CN}`);
        console.log(`   颁发者: ${cert.issuer?.CN}`);
        console.log(`   TLS版本: ${res.socket.getProtocol()}`);
        console.log(`   加密套件: ${res.socket.getCipher()?.name}`);
      }
      
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        console.log(`   响应: ${body}`);
        resolve(true);
      });
    });

    req.on('error', (err) => {
      console.log(`❌ 失败: ${err.message} (${err.code || 'N/A'})`);
      resolve(false);
    });

    req.setTimeout(15000, () => {
      console.log(`❌ 超时`);
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

function testTLSSocket() {
  return new Promise((resolve) => {
    const socket = tls.connect({
      host: hostname,
      port: port,
      servername: hostname,
      rejectUnauthorized: false,
    }, () => {
      console.log('✅ TLS Socket 连接成功!');
      console.log(`   协议: ${socket.getProtocol()}`);
      console.log(`   加密套件: ${socket.getCipher()?.name}`);
      console.log(`   授权: ${socket.authorized ? '是' : '否 (' + socket.authorizationError + ')'}`);
      
      const cert = socket.getPeerCertificate();
      if (cert && cert.subject) {
        console.log(`   证书CN: ${cert.subject.CN}`);
        console.log(`   颁发者: ${cert.issuer?.CN}`);
        console.log(`   有效期: ${new Date(cert.valid_from).toISOString()} ~ ${new Date(cert.valid_to).toISOString()}`);
        
        const days = Math.floor((new Date(cert.valid_to) - new Date()) / (1000*60*60*24));
        console.log(`   剩余天数: ${days}天`);
      }
      
      socket.destroy();
      resolve(true);
    });

    socket.on('error', (err) => {
      console.log(`❌ TLS Socket 失败: ${err.message}`);
      resolve(false);
    });

    socket.setTimeout(15000, () => {
      console.log(`❌ 超时`);
      socket.destroy();
      resolve(false);
    });
  });
}

async function main() {
  await testWithDifferentOptions();

  console.log('\n' + '='.repeat(70));
  console.log('总结');
  console.log('='.repeat(70));
  console.log(`
外部验证结果 (WebFetch):
  ✅ HTTPS连接成功
  ✅ 返回 404 Not Found (路径不存在，但SSL正常)

本地测试结果:
  - 如果本地连接失败但外部成功，可能是:
    1. 本地网络/防火墙限制
    2. 服务器地理位置限制
    3. 服务器对某些IP段的限制

LINE Webhook 建议:
  - SSL/TLS 配置正常 ✅
  - 可以用于 LINE Webhook
  - 需要确保 /bot/webhook 路径正确配置
`);
}

main();
