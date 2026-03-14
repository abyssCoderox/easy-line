const https = require('https');
const http = require('http');
const dns = require('dns');
const net = require('net');
const tls = require('tls');
const { URL } = require('url');

const webhookUrl = 'https://dev.abysshaven.online/bot/webhook';
const parsedUrl = new URL(webhookUrl);
const hostname = parsedUrl.hostname;
const port = parsedUrl.port || 443;

console.log('='.repeat(70));
console.log('SSL/TLS 完整诊断测试');
console.log('='.repeat(70));
console.log(`目标: ${webhookUrl}`);
console.log(`主机: ${hostname}:${port}`);
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
        console.log(`   IPv${family}`);
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
      console.log(`✅ TCP 连接成功`);
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
      rejectUnauthorized: false,
      minVersion: 'TLSv1',
    };

    const socket = tls.connect(options, () => {
      console.log(`✅ TLS 握手成功`);
      
      const cert = socket.getPeerCertificate();
      if (cert && Object.keys(cert).length > 0) {
        console.log('\n   [证书详情]');
        console.log(`   主体(CN): ${cert.subject?.CN || 'N/A'}`);
        console.log(`   颁发者: ${cert.issuer?.CN || 'N/A'}`);
        console.log(`   有效期: ${new Date(cert.valid_from).toISOString()} ~ ${new Date(cert.valid_to).toISOString()}`);
        
        const now = new Date();
        const validTo = new Date(cert.valid_to);
        const daysRemaining = Math.floor((validTo - now) / (1000 * 60 * 60 * 24));
        console.log(`   剩余天数: ${daysRemaining} 天`);
        
        if (cert.subject?.altNames) {
          console.log(`   SAN: ${cert.subject.altNames.join(', ')}`);
        }
      }

      console.log(`\n   [TLS信息]`);
      console.log(`   协议版本: ${socket.getProtocol()}`);
      console.log(`   加密套件: ${socket.getCipher()?.name || 'N/A'}`);

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
      rejectUnauthorized: false,
      timeout: 15000,
    };

    const req = https.request(options, (res) => {
      console.log(`✅ HTTPS 请求成功`);
      console.log(`   状态码: ${res.statusCode}`);
      console.log(`   响应头: ${JSON.stringify(res.headers).substring(0, 200)}...`);
      
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        console.log(`   响应体长度: ${body.length} 字节`);
        resolve({ success: true, statusCode: res.statusCode });
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

async function testHTTPRedirect() {
  return new Promise((resolve) => {
    console.log('\n[5] HTTP 重定向测试 (检查是否强制HTTPS)');
    
    const options = {
      hostname: hostname,
      port: 80,
      path: '/bot/webhook',
      method: 'GET',
      timeout: 10000,
    };

    const req = http.request(options, (res) => {
      console.log(`   HTTP 状态码: ${res.statusCode}`);
      if (res.statusCode >= 300 && res.statusCode < 400) {
        console.log(`   重定向到: ${res.headers.location || 'N/A'}`);
      }
      resolve(res.statusCode);
    });

    req.on('error', (err) => {
      console.log(`   HTTP 连接失败: ${err.message}`);
      resolve(null);
    });

    req.on('timeout', () => {
      console.log(`   HTTP 请求超时`);
      req.destroy();
      resolve(null);
    });

    req.end();
  });
}

async function testWithOpenSSL() {
  return new Promise((resolve) => {
    console.log('\n[6] 使用 OpenSSL 命令行测试 (如果可用)');
    
    const { exec } = require('child_process');
    
    exec(`echo | openssl s_client -connect ${hostname}:${port} -servername ${hostname} 2>&1 | head -30`, 
      { timeout: 15000 },
      (error, stdout, stderr) => {
        if (error) {
          console.log(`   OpenSSL 不可用或执行失败`);
        } else {
          console.log(`   OpenSSL 输出:`);
          console.log(stdout.split('\n').map(line => '   ' + line).join('\n'));
        }
        resolve();
      }
    );
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
      }
    }
  }
  
  await testHTTPRedirect();
  await testWithOpenSSL();

  console.log('\n' + '='.repeat(70));
  console.log('诊断总结');
  console.log('='.repeat(70));
  
  console.log(`
可能的问题原因:
1. 服务器防火墙阻止了来自特定IP的连接
2. 服务器配置了IP白名单
3. TLS配置不兼容 (如只支持特定的加密套件)
4. 服务器负载过高或服务未正常运行
5. 反向代理配置问题 (如Nginx/Apache配置)
6. SNI (Server Name Indication) 配置问题

建议检查:
1. 服务器防火墙规则 (iptables, ufw, 云服务商安全组)
2. Web服务器SSL配置 (Nginx: ssl_protocols, ssl_ciphers)
3. 服务器日志 (/var/log/nginx/error.log 等)
4. 使用其他工具验证: 
   - curl -v ${webhookUrl}
   - openssl s_client -connect ${hostname}:${port} -servername ${hostname}
   - nmap --script ssl-enum-ciphers -p ${port} ${hostname}
`);
}

main();
