const https = require('https');
const tls = require('tls');
const { URL } = require('url');

const webhookUrl = 'https://dev.abysshaven.online/bot/webhook';

function analyzeSSL(urlString) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlString);
    const hostname = parsedUrl.hostname;
    const port = parsedUrl.port || 443;

    console.log('='.repeat(60));
    console.log('SSL/TLS 验证测试');
    console.log('='.repeat(60));
    console.log(`目标URL: ${urlString}`);
    console.log(`主机名: ${hostname}`);
    console.log(`端口: ${port}`);
    console.log('='.repeat(60));

    const startTime = Date.now();

    const req = https.request(
      {
        hostname,
        port,
        path: parsedUrl.pathname,
        method: 'GET',
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
      },
      (res) => {
        const responseTime = Date.now() - startTime;
        const socket = res.socket;

        console.log('\n[连接信息]');
        console.log(`响应状态码: ${res.statusCode}`);
        console.log(`响应时间: ${responseTime}ms`);
        console.log(`远程地址: ${socket.remoteAddress}`);
        console.log(`远程端口: ${socket.remotePort}`);

        const cert = socket.getPeerCertificate();

        if (cert) {
          console.log('\n[证书信息]');
          console.log(`主体(CN): ${cert.subject?.CN || 'N/A'}`);
          console.log(`颁发者: ${cert.issuer?.CN || 'N/A'}`);
          console.log(`证书序列号: ${cert.serialNumber || 'N/A'}`);
          console.log(`签名算法: ${cert.signatureAlgorithm || 'N/A'}`);
          console.log(`密钥位数: ${cert.bits || 'N/A'} bits`);
          console.log(`有效期开始: ${new Date(cert.valid_from).toISOString()}`);
          console.log(`有效期结束: ${new Date(cert.valid_to).toISOString()}`);

          const now = new Date();
          const validFrom = new Date(cert.valid_from);
          const validTo = new Date(cert.valid_to);
          const daysRemaining = Math.floor((validTo - now) / (1000 * 60 * 60 * 24));

          console.log(`剩余有效天数: ${daysRemaining} 天`);

          if (now < validFrom) {
            console.log('⚠️  证书尚未生效!');
          } else if (now > validTo) {
            console.log('❌ 证书已过期!');
          } else {
            console.log('✅ 证书在有效期内');
          }

          if (cert.subject?.altNames) {
            console.log(`\nSAN (主题备用名称): ${cert.subject.altNames.join(', ')}`);
          }
        }

        console.log('\n[TLS/SSL 协议信息]');
        console.log(`协议版本: ${socket.getProtocol()}`);
        console.log(`加密套件: ${socket.getCipher()?.name || 'N/A'}`);
        console.log(`加密强度: ${socket.getCipher()?.bits || 'N/A'} bits`);

        const protocol = socket.getProtocol();
        if (protocol === 'TLSv1.3') {
          console.log('✅ 使用最新的 TLSv1.3 协议');
        } else if (protocol === 'TLSv1.2') {
          console.log('✅ 使用 TLSv1.2 协议 (安全)');
        } else if (protocol && protocol.includes('TLSv1.1')) {
          console.log('⚠️  使用 TLSv1.1 (已弃用，建议升级)');
        } else if (protocol && protocol.includes('TLSv1.0')) {
          console.log('❌ 使用 TLSv1.0 (不安全，已弃用)');
        } else if (protocol && protocol.includes('SSL')) {
          console.log('❌ 使用 SSL 协议 (不安全，已弃用)');
        }

        console.log('\n[安全评估]');
        const cipher = socket.getCipher();
        if (cipher) {
          const cipherName = cipher.name;
          const insecureCiphers = ['RC4', 'DES', '3DES', 'MD5', 'NULL', 'EXPORT'];
          const isInsecure = insecureCiphers.some(c => cipherName.includes(c));
          
          if (isInsecure) {
            console.log(`❌ 加密套件不安全: ${cipherName}`);
          } else {
            console.log(`✅ 加密套件安全: ${cipherName}`);
          }
        }

        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          console.log('\n[响应体预览]');
          const preview = body.substring(0, 500);
          console.log(preview || '(无响应体)');
          
          console.log('\n' + '='.repeat(60));
          console.log('SSL/TLS 验证完成');
          console.log('='.repeat(60));

          resolve({
            statusCode: res.statusCode,
            cert,
            protocol,
            cipher,
            responseTime,
          });
        });
      }
    );

    req.on('error', (err) => {
      console.log('\n❌ 连接错误!');
      console.log(`错误类型: ${err.code || 'UNKNOWN'}`);
      console.log(`错误信息: ${err.message}`);

      if (err.code === 'CERT_HAS_EXPIRED') {
        console.log('原因: 证书已过期');
      } else if (err.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
        console.log('原因: 自签名证书');
      } else if (err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
        console.log('原因: 无法验证证书签名');
      } else if (err.code === 'CERT_UNTRUSTED') {
        console.log('原因: 证书不受信任');
      } else if (err.code === 'HOSTNAME_MISMATCH') {
        console.log('原因: 主机名与证书不匹配');
      } else if (err.code === 'ECONNREFUSED') {
        console.log('原因: 连接被拒绝');
      } else if (err.code === 'ETIMEDOUT') {
        console.log('原因: 连接超时');
      } else if (err.code === 'ENOTFOUND') {
        console.log('原因: 域名无法解析');
      }

      reject(err);
    });

    req.on('socket', (socket) => {
      socket.on('secureConnect', () => {
        console.log('✅ SSL/TLS 握手成功');
      });
    });

    req.setTimeout(30000, () => {
      console.log('❌ 请求超时 (30秒)');
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

function testTLSVersions(hostname, port = 443) {
  return new Promise((resolve) => {
    console.log('\n[TLS 版本兼容性测试]');
    
    const versions = ['TLSv1.3', 'TLSv1.2', 'TLSv1.1', 'TLSv1'];
    const results = [];

    versions.forEach((version, index) => {
      setTimeout(() => {
        const socket = tls.connect(
          {
            host: hostname,
            port,
            minVersion: version,
            maxVersion: version,
            rejectUnauthorized: false,
          },
          () => {
            console.log(`  ${version}: ✅ 支持`);
            results.push({ version, supported: true });
            socket.destroy();
          }
        );

        socket.on('error', (err) => {
          console.log(`  ${version}: ❌ 不支持 (${err.message})`);
          results.push({ version, supported: false });
        });

        if (index === versions.length - 1) {
          setTimeout(() => resolve(results), 1000);
        }
      }, index * 500);
    });
  });
}

async function main() {
  try {
    const parsedUrl = new URL(webhookUrl);
    
    await analyzeSSL(webhookUrl);
    await testTLSVersions(parsedUrl.hostname, parsedUrl.port || 443);

    console.log('\n[总结]');
    console.log('SSL/TLS 配置验证完成。如果上述所有检查项都显示 ✅，');
    console.log('则说明服务器的 SSL/TLS 配置正常，可以用于 LINE Webhook。');
    
  } catch (error) {
    console.log('\n[错误总结]');
    console.log('SSL/TLS 验证失败，请检查服务器配置。');
    console.log('常见问题：');
    console.log('1. 证书过期或无效');
    console.log('2. 证书链不完整');
    console.log('3. 域名与证书不匹配');
    console.log('4. 服务器防火墙阻止连接');
    console.log('5. TLS 版本不兼容');
    process.exit(1);
  }
}

main();
