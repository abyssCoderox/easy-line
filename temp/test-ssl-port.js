const https = require('https');
const tls = require('tls');
const dns = require('dns');
const net = require('net');
const { URL } = require('url');

const webhookUrl = 'https://abysshaven.online:31443/bot/webhook';
const parsedUrl = new URL(webhookUrl);
const hostname = parsedUrl.hostname;
const port = parsedUrl.port || 443;

console.log('='.repeat(70));
console.log('SSL/TLS 验证测试');
console.log('='.repeat(70));
console.log(`目标URL: ${webhookUrl}`);
console.log(`主机名: ${hostname}`);
console.log(`端口: ${port}`);
console.log('='.repeat(70));

async function testDNS() {
  return new Promise((resolve) => {
    console.log('\n[1] DNS 解析测试');
    dns.lookup(hostname, (err, address, family) => {
      if (err) {
        console.log(`❌ DNS 解析失败: ${err.message}`);
        resolve(null);
      } else {
        console.log(`✅ DNS 解析成功`);
        console.log(`   IP地址: ${address}`);
        resolve(address);
      }
    });
  });
}

async function testTCPConnection(host, port) {
  return new Promise((resolve) => {
    console.log('\n[2] TCP 连接测试');
    const socket = new net.Socket();
    const timeout = 10000;

    socket.setTimeout(timeout);

    socket.connect(port, host, () => {
      console.log(`✅ TCP 连接成功 (${host}:${port})`);
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      console.log(`❌ TCP 连接超时 (${timeout}ms)`);
      socket.destroy();
      resolve(false);
    });

    socket.on('error', (err) => {
      console.log(`❌ TCP 连接失败: ${err.message}`);
      resolve(false);
    });
  });
}

async function testTLSHandshake(host, port) {
  return new Promise((resolve) => {
    console.log('\n[3] TLS 握手测试');
    
    const options = {
      host: host,
      port: port,
      servername: hostname,
      rejectUnauthorized: true,
    };

    const socket = tls.connect(options, () => {
      console.log(`✅ TLS 握手成功`);
      
      const cert = socket.getPeerCertificate();
      if (cert && Object.keys(cert).length > 0) {
        console.log('\n   [证书详情]');
        console.log(`   主体(CN): ${cert.subject?.CN || 'N/A'}`);
        console.log(`   颁发者: ${cert.issuer?.CN || 'N/A'}`);
        console.log(`   证书序列号: ${cert.serialNumber || 'N/A'}`);
        console.log(`   签名算法: ${cert.signatureAlgorithm || 'N/A'}`);
        console.log(`   密钥位数: ${cert.bits || 'N/A'} bits`);
        console.log(`   有效期开始: ${new Date(cert.valid_from).toISOString()}`);
        console.log(`   有效期结束: ${new Date(cert.valid_to).toISOString()}`);
        
        const now = new Date();
        const validFrom = new Date(cert.valid_from);
        const validTo = new Date(cert.valid_to);
        const daysRemaining = Math.floor((validTo - now) / (1000 * 60 * 60 * 24));
        console.log(`   剩余有效天数: ${daysRemaining} 天`);
        
        if (now < validFrom) {
          console.log('   ⚠️  证书尚未生效!');
        } else if (now > validTo) {
          console.log('   ❌ 证书已过期!');
        } else {
          console.log('   ✅ 证书在有效期内');
        }

        if (cert.subject?.altNames) {
          console.log(`   SAN (主题备用名称): ${cert.subject.altNames.join(', ')}`);
        }
      }

      console.log('\n   [TLS信息]');
      console.log(`   协议版本: ${socket.getProtocol()}`);
      const cipher = socket.getCipher();
      console.log(`   加密套件: ${cipher?.name || 'N/A'}`);
      console.log(`   加密强度: ${cipher?.bits || 'N/A'} bits`);
      console.log(`   证书验证: ${socket.authorized ? '✅ 通过' : '❌ 失败: ' + socket.authorizationError}`);

      const protocol = socket.getProtocol();
      if (protocol === 'TLSv1.3') {
        console.log('   ✅ 使用最新的 TLSv1.3 协议');
      } else if (protocol === 'TLSv1.2') {
        console.log('   ✅ 使用 TLSv1.2 协议 (安全)');
      }

      socket.destroy();
      resolve(true);
    });

    socket.on('error', (err) => {
      console.log(`❌ TLS 握手失败: ${err.message}`);
      console.log(`   错误码: ${err.code || 'N/A'}`);
      resolve(false);
    });

    socket.setTimeout(15000, () => {
      console.log(`❌ TLS 握手超时`);
      socket.destroy();
      resolve(false);
    });
  });
}

async function testHTTPSRequest(urlString) {
  return new Promise((resolve) => {
    console.log('\n[4] HTTPS 请求测试');
    
    const parsed = new URL(urlString);
    
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname,
      method: 'GET',
      rejectUnauthorized: true,
      timeout: 15000,
    };

    const startTime = Date.now();

    const req = https.request(options, (res) => {
      const responseTime = Date.now() - startTime;
      console.log(`✅ HTTPS 请求成功`);
      console.log(`   状态码: ${res.statusCode}`);
      console.log(`   响应时间: ${responseTime}ms`);
      console.log(`   响应头:`);
      console.log(`     Content-Type: ${res.headers['content-type'] || 'N/A'}`);
      console.log(`     Date: ${res.headers['date'] || 'N/A'}`);
      
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        console.log(`   响应体: ${body}`);
        resolve({ success: true, statusCode: res.statusCode, body });
      });
    });

    req.on('error', (err) => {
      console.log(`❌ HTTPS 请求失败: ${err.message}`);
      console.log(`   错误码: ${err.code || 'N/A'}`);
      resolve({ success: false, error: err });
    });

    req.on('timeout', () => {
      console.log(`❌ HTTPS 请求超时`);
      req.destroy();
      resolve({ success: false, error: new Error('Timeout') });
    });

    req.end();
  });
}

async function main() {
  const ip = await testDNS();
  
  if (ip) {
    const tcpOk = await testTCPConnection(ip, port);
    
    if (tcpOk) {
      const tlsOk = await testTLSHandshake(ip, port);
      
      if (tlsOk) {
        await testHTTPSRequest(webhookUrl);
      } else {
        console.log('\n尝试禁用证书验证进行请求...');
        await testHTTPSRequest(webhookUrl);
      }
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('验证完成');
  console.log('='.repeat(70));
}

main();
