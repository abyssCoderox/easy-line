const https = require('https');
const http = require('http');
const tls = require('tls');
const dns = require('dns');
const net = require('net');
const crypto = require('crypto');
const { URL } = require('url');

const config = {
  hostname: 'abysshaven.online',
  port: 31443,
  path: '/openclaw/line/webhook',
  lineToken: 'VRYxT1vYCEkO77CWDRvfIdCaK/HbDV4LssBah7dIhi14RDD074NUAoB16MyHSUgrrQy6rBx0ZQtdd3qUYtQA36B3fEh6okg0D/1uKyYyh3TcyJMLzNUrZUSSo/to/PPyuyddlEIQDLnAPa9eLSf7JwdB04t89/1O/w1cDnyilFU='
};

const results = {
  passed: [],
  failed: [],
  warnings: [],
  details: {}
};

function log(section, message, status = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = status === 'pass' ? '✅' : status === 'fail' ? '❌' : status === 'warn' ? '⚠️' : 'ℹ️';
  console.log(`[${timestamp}] [${section}] ${prefix} ${message}`);
  
  if (status === 'pass') results.passed.push(`${section}: ${message}`);
  else if (status === 'fail') results.failed.push(`${section}: ${message}`);
  else if (status === 'warn') results.warnings.push(`${section}: ${message}`);
}

console.log('='.repeat(80));
console.log('LINE Webhook TLS 握手失败 - 系统性诊断报告');
console.log('='.repeat(80));
console.log(`目标服务器: ${config.hostname}:${config.port}`);
console.log(`目标路径: ${config.path}`);
console.log(`完整URL: https://${config.hostname}:${config.port}${config.path}`);
console.log(`诊断时间: ${new Date().toISOString()}`);
console.log('='.repeat(80));

async function test1_DNSResolution() {
  console.log('\n' + '='.repeat(80));
  console.log('【检查1】DNS 解析测试');
  console.log('='.repeat(80));

  return new Promise((resolve) => {
    dns.lookup(config.hostname, (err, address, family) => {
      if (err) {
        log('DNS', `DNS解析失败: ${err.message}`, 'fail');
        results.details.dns = { error: err.message };
        resolve(false);
      } else {
        log('DNS', `DNS解析成功: ${config.hostname} -> ${address} (IPv${family})`, 'pass');
        results.details.dns = { address, family };
        resolve(true);
      }
    });
  });
}

async function test2_TCPConnection() {
  console.log('\n' + '='.repeat(80));
  console.log('【检查2】TCP 连接测试');
  console.log('='.repeat(80));

  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();
    const timeout = 10000;

    socket.setTimeout(timeout);

    socket.connect(config.port, results.details.dns?.address || config.hostname, () => {
      const latency = Date.now() - startTime;
      log('TCP', `TCP连接成功: ${config.hostname}:${config.port} (${latency}ms)`, 'pass');
      results.details.tcp = { connected: true, latency };
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      log('TCP', `TCP连接超时 (${timeout}ms)`, 'fail');
      results.details.tcp = { error: 'timeout' };
      socket.destroy();
      resolve(false);
    });

    socket.on('error', (err) => {
      log('TCP', `TCP连接失败: ${err.message}`, 'fail');
      results.details.tcp = { error: err.message };
      resolve(false);
    });
  });
}

async function test3_TLSCertificateChain() {
  console.log('\n' + '='.repeat(80));
  console.log('【检查3】SSL 证书链完整性验证');
  console.log('='.repeat(80));

  return new Promise((resolve) => {
    const socket = tls.connect({
      host: results.details.dns?.address || config.hostname,
      port: config.port,
      servername: config.hostname,
      rejectUnauthorized: true,
    }, () => {
      log('TLS', 'TLS握手成功 (证书验证通过)', 'pass');
      
      const cert = socket.getPeerCertificate();
      const protocol = socket.getProtocol();
      const cipher = socket.getCipher();
      
      console.log('\n  --- 证书详情 ---');
      console.log(`  主体(CN): ${cert.subject?.CN || 'N/A'}`);
      console.log(`  颁发者: ${cert.issuer?.CN || 'N/A'}`);
      console.log(`  组织: ${cert.issuer?.O || 'N/A'}`);
      console.log(`  有效期: ${new Date(cert.valid_from).toISOString()} ~ ${new Date(cert.valid_to).toISOString()}`);
      
      const now = new Date();
      const validFrom = new Date(cert.valid_from);
      const validTo = new Date(cert.valid_to);
      const daysRemaining = Math.floor((validTo - now) / (1000 * 60 * 60 * 24));
      
      if (now < validFrom) {
        log('TLS', '证书尚未生效!', 'fail');
      } else if (now > validTo) {
        log('TLS', '证书已过期!', 'fail');
      } else {
        log('TLS', `证书有效期正常 (剩余 ${daysRemaining} 天)`, 'pass');
      }

      console.log('\n  --- 证书链检查 ---');
      let certChain = [];
      let currentCert = cert;
      let chainDepth = 0;
      
      while (currentCert && chainDepth < 10) {
        chainDepth++;
        console.log(`  [${chainDepth}] CN: ${currentCert.subject?.CN || 'N/A'}`);
        console.log(`      颁发者: ${currentCert.issuer?.CN || 'N/A'}`);
        certChain.push({
          cn: currentCert.subject?.CN,
          issuer: currentCert.issuer?.CN
        });
        
        if (currentCert.issuerCertificate && currentCert.issuerCertificate !== currentCert) {
          currentCert = currentCert.issuerCertificate;
        } else {
          break;
        }
      }
      
      if (chainDepth >= 2) {
        log('TLS', `证书链完整 (共 ${chainDepth} 层)`, 'pass');
      } else {
        log('TLS', '证书链可能不完整 (缺少中间证书)', 'warn');
      }

      console.log('\n  --- TLS 协议信息 ---');
      console.log(`  协议版本: ${protocol}`);
      console.log(`  加密套件: ${cipher?.name}`);
      console.log(`  加密强度: ${cipher?.bits} bits`);
      console.log(`  授权状态: ${socket.authorized ? '已授权' : '未授权'}`);
      
      if (!socket.authorized) {
        log('TLS', `授权错误: ${socket.authorizationError}`, 'fail');
      }

      results.details.tls = {
        success: true,
        authorized: socket.authorized,
        authorizationError: socket.authorizationError,
        protocol,
        cipher: cipher?.name,
        certChain,
        cert: {
          cn: cert.subject?.CN,
          issuer: cert.issuer?.CN,
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          daysRemaining
        }
      };

      socket.destroy();
      resolve(true);
    });

    socket.on('error', (err) => {
      log('TLS', `TLS握手失败: ${err.message}`, 'fail');
      log('TLS', `错误码: ${err.code || 'N/A'}`, 'fail');
      
      if (err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
        log('TLS', '诊断: 证书链不完整，缺少中间证书', 'warn');
      } else if (err.code === 'CERT_HAS_EXPIRED') {
        log('TLS', '诊断: 证书已过期', 'warn');
      } else if (err.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
        log('TLS', '诊断: 自签名证书', 'warn');
      } else if (err.code === 'ECONNRESET') {
        log('TLS', '诊断: 连接被重置，可能是防火墙或网络设备干扰', 'warn');
      }
      
      results.details.tls = { success: false, error: err.message, code: err.code };
      resolve(false);
    });

    socket.setTimeout(15000, () => {
      log('TLS', 'TLS握手超时', 'fail');
      results.details.tls = { error: 'timeout' };
      socket.destroy();
      resolve(false);
    });
  });
}

async function test4_TLSWithRejectFalse() {
  console.log('\n' + '='.repeat(80));
  console.log('【检查4】禁用证书验证的TLS连接测试');
  console.log('='.repeat(80));

  return new Promise((resolve) => {
    const socket = tls.connect({
      host: results.details.dns?.address || config.hostname,
      port: config.port,
      servername: config.hostname,
      rejectUnauthorized: false,
    }, () => {
      log('TLS', 'TLS连接成功 (证书验证已禁用)', 'pass');
      
      const cert = socket.getPeerCertificate();
      console.log(`  证书CN: ${cert.subject?.CN}`);
      console.log(`  颁发者: ${cert.issuer?.CN}`);
      console.log(`  授权错误: ${socket.authorizationError || '无'}`);
      
      results.details.tlsNoVerify = {
        success: true,
        certCn: cert.subject?.CN,
        issuer: cert.issuer?.CN,
        authError: socket.authorizationError
      };

      socket.destroy();
      resolve(true);
    });

    socket.on('error', (err) => {
      log('TLS', `即使禁用验证也失败: ${err.message}`, 'fail');
      results.details.tlsNoVerify = { success: false, error: err.message };
      resolve(false);
    });

    socket.setTimeout(15000, () => {
      log('TLS', '连接超时', 'fail');
      results.details.tlsNoVerify = { error: 'timeout' };
      socket.destroy();
      resolve(false);
    });
  });
}

async function test5_HTTPSRequest() {
  console.log('\n' + '='.repeat(80));
  console.log('【检查5】HTTPS 请求测试');
  console.log('='.repeat(80));

  return new Promise((resolve) => {
    const options = {
      hostname: config.hostname,
      port: config.port,
      path: config.path,
      method: 'GET',
      rejectUnauthorized: true,
      timeout: 15000,
    };

    const startTime = Date.now();

    const req = https.request(options, (res) => {
      const latency = Date.now() - startTime;
      log('HTTPS', `HTTPS请求成功: ${res.statusCode} (${latency}ms)`, 'pass');
      
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        console.log(`  响应体: ${body.substring(0, 200)}`);
        results.details.https = {
          success: true,
          statusCode: res.statusCode,
          latency,
          body: body.substring(0, 500)
        };
        resolve(true);
      });
    });

    req.on('error', (err) => {
      log('HTTPS', `HTTPS请求失败: ${err.message} (${err.code || 'N/A'})`, 'fail');
      results.details.https = { success: false, error: err.message, code: err.code };
      resolve(false);
    });

    req.on('timeout', () => {
      log('HTTPS', 'HTTPS请求超时', 'fail');
      results.details.https = { error: 'timeout' };
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

async function test6_CipherSuites() {
  console.log('\n' + '='.repeat(80));
  console.log('【检查6】加密套件兼容性测试');
  console.log('='.repeat(80));

  const cipherSuites = [
    'TLS_AES_128_GCM_SHA256',
    'TLS_AES_256_GCM_SHA384',
    'TLS_CHACHA20_POLY1305_SHA256',
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-ECDSA-AES128-GCM-SHA256',
    'ECDHE-ECDSA-AES256-GCM-SHA384',
  ];

  const supportedCiphers = [];

  for (const cipher of cipherSuites) {
    const supported = await new Promise((resolve) => {
      const socket = tls.connect({
        host: results.details.dns?.address || config.hostname,
        port: config.port,
        servername: config.hostname,
        rejectUnauthorized: false,
        ciphers: cipher,
        minVersion: 'TLSv1.2',
      }, () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => resolve(false));
      socket.setTimeout(5000, () => {
        socket.destroy();
        resolve(false);
      });
    });

    if (supported) {
      supportedCiphers.push(cipher);
      console.log(`  ✅ ${cipher}`);
    } else {
      console.log(`  ❌ ${cipher}`);
    }
  }

  if (supportedCiphers.length > 0) {
    log('Cipher', `支持 ${supportedCiphers.length}/${cipherSuites.length} 种加密套件`, 'pass');
    results.details.ciphers = { supported: supportedCiphers, total: cipherSuites.length };
    return true;
  } else {
    log('Cipher', '没有支持的加密套件', 'fail');
    results.details.ciphers = { supported: [], total: cipherSuites.length };
    return false;
  }
}

async function test7_TLSVersions() {
  console.log('\n' + '='.repeat(80));
  console.log('【检查7】TLS 版本兼容性测试');
  console.log('='.repeat(80));

  const versions = [
    { name: 'TLSv1.3', min: 'TLSv1.3', max: 'TLSv1.3' },
    { name: 'TLSv1.2', min: 'TLSv1.2', max: 'TLSv1.2' },
    { name: 'TLSv1.1', min: 'TLSv1.1', max: 'TLSv1.1' },
    { name: 'TLSv1.0', min: 'TLSv1', max: 'TLSv1' },
  ];

  const supportedVersions = [];

  for (const v of versions) {
    const supported = await new Promise((resolve) => {
      const socket = tls.connect({
        host: results.details.dns?.address || config.hostname,
        port: config.port,
        servername: config.hostname,
        rejectUnauthorized: false,
        minVersion: v.min,
        maxVersion: v.max,
      }, () => {
        const protocol = socket.getProtocol();
        socket.destroy();
        resolve(protocol);
      });

      socket.on('error', () => resolve(null));
      socket.setTimeout(5000, () => {
        socket.destroy();
        resolve(null);
      });
    });

    if (supported) {
      supportedVersions.push({ requested: v.name, actual: supported });
      console.log(`  ✅ ${v.name} -> ${supported}`);
    } else {
      console.log(`  ❌ ${v.name}`);
    }
  }

  if (supportedVersions.some(v => v.actual === 'TLSv1.2' || v.actual === 'TLSv1.3')) {
    log('TLS', '支持安全的TLS版本 (1.2/1.3)', 'pass');
    results.details.tlsVersions = supportedVersions;
    return true;
  } else {
    log('TLS', '不支持安全的TLS版本', 'fail');
    results.details.tlsVersions = supportedVersions;
    return false;
  }
}

async function test8_LINEWebhookTest() {
  console.log('\n' + '='.repeat(80));
  console.log('【检查8】LINE Webhook 测试接口调用');
  console.log('='.repeat(80));

  const endpoint = `https://${config.hostname}:${config.port}${config.path}`;
  
  return new Promise((resolve) => {
    const postData = JSON.stringify({ endpoint });

    const options = {
      hostname: 'api.line.me',
      port: 443,
      path: '/v2/bot/channel/webhook/test',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.lineToken}`,
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
          console.log(`  状态码: ${res.statusCode}`);
          console.log(`  成功: ${json.success ? '是' : '否'}`);
          console.log(`  原因: ${json.reason || 'N/A'}`);
          console.log(`  详情: ${json.detail || 'N/A'}`);
          
          if (json.success) {
            log('LINE', 'LINE Webhook 测试成功!', 'pass');
          } else {
            log('LINE', `LINE Webhook 测试失败: ${json.reason}`, 'fail');
          }
          
          results.details.line = json;
          resolve(json);
        } catch (e) {
          log('LINE', `响应解析失败: ${body}`, 'fail');
          results.details.line = { error: 'parse error', body };
          resolve(null);
        }
      });
    });

    req.on('error', (err) => {
      log('LINE', `请求失败: ${err.message}`, 'fail');
      results.details.line = { error: err.message };
      resolve(null);
    });

    req.setTimeout(15000, () => {
      log('LINE', '请求超时', 'fail');
      results.details.line = { error: 'timeout' };
      req.destroy();
      resolve(null);
    });

    req.write(postData);
    req.end();
  });
}

async function test9_SNIValidation() {
  console.log('\n' + '='.repeat(80));
  console.log('【检查9】SNI (Server Name Indication) 配置验证');
  console.log('='.repeat(80));

  return new Promise((resolve) => {
    let sniReceived = false;
    
    const socket = tls.connect({
      host: results.details.dns?.address || config.hostname,
      port: config.port,
      servername: config.hostname,
      rejectUnauthorized: false,
    }, () => {
      const cert = socket.getPeerCertificate();
      
      if (cert.subject?.CN === config.hostname || 
          (cert.subject?.altNames && cert.subject.altNames.includes(config.hostname))) {
        log('SNI', `SNI配置正确: 证书匹配 ${config.hostname}`, 'pass');
        sniReceived = true;
      } else {
        log('SNI', `SNI可能有问题: 证书CN=${cert.subject?.CN}, 请求=${config.hostname}`, 'warn');
      }
      
      console.log(`  请求的SNI: ${config.hostname}`);
      console.log(`  证书CN: ${cert.subject?.CN}`);
      if (cert.subject?.altNames) {
        console.log(`  证书SAN: ${cert.subject.altNames.join(', ')}`);
      }

      results.details.sni = {
        requested: config.hostname,
        certCn: cert.subject?.CN,
        altNames: cert.subject?.altNames,
        match: sniReceived
      };

      socket.destroy();
      resolve(sniReceived);
    });

    socket.on('error', (err) => {
      log('SNI', `SNI测试失败: ${err.message}`, 'fail');
      results.details.sni = { error: err.message };
      resolve(false);
    });

    socket.setTimeout(15000, () => {
      log('SNI', 'SNI测试超时', 'fail');
      results.details.sni = { error: 'timeout' };
      socket.destroy();
      resolve(false);
    });
  });
}

async function generateReport() {
  console.log('\n' + '='.repeat(80));
  console.log('【诊断报告】');
  console.log('='.repeat(80));

  console.log('\n--- 通过的检查项 ---');
  results.passed.forEach(item => console.log(`  ✅ ${item}`));

  console.log('\n--- 失败的检查项 ---');
  if (results.failed.length === 0) {
    console.log('  (无)');
  } else {
    results.failed.forEach(item => console.log(`  ❌ ${item}`));
  }

  console.log('\n--- 警告项 ---');
  if (results.warnings.length === 0) {
    console.log('  (无)');
  } else {
    results.warnings.forEach(item => console.log(`  ⚠️ ${item}`));
  }

  console.log('\n--- 详细结果 ---');
  console.log(JSON.stringify(results.details, null, 2));

  console.log('\n' + '='.repeat(80));
  console.log('【排查建议】');
  console.log('='.repeat(80));

  const suggestions = [];

  if (results.details.tls?.success === false) {
    if (results.details.tls.code === 'ECONNRESET') {
      suggestions.push({
        issue: 'TLS握手时连接被重置',
        possible: [
          '服务器防火墙阻止了连接',
          '中间网络设备(WAF/负载均衡器)干扰',
          '服务器TLS配置问题',
          'IP白名单限制'
        ],
        action: [
          '检查服务器防火墙规则 (iptables/ufw/云安全组)',
          '检查是否有WAF或负载均衡器',
          '检查Nginx错误日志: tail -f /var/log/nginx/error.log',
          '检查系统日志: journalctl -u nginx -f'
        ]
      });
    }
  }

  if (results.details.tlsNoVerify?.success === true && results.details.tls?.success === false) {
    suggestions.push({
      issue: '禁用证书验证后可连接，说明证书有问题',
      possible: [
        '证书链不完整 (缺少中间证书)',
        '证书过期或尚未生效',
        '证书域名不匹配'
      ],
      action: [
        '检查Nginx配置: ssl_certificate 应使用 fullchain.pem',
        '运行: openssl s_client -connect abysshaven.online:31443 -servername abysshaven.online',
        '检查证书: openssl x509 -in /path/to/cert.pem -text -noout'
      ]
    });
  }

  if (results.details.line?.success === false) {
    if (results.details.line.reason === 'COULD_NOT_CONNECT') {
      suggestions.push({
        issue: 'LINE服务器无法连接到你的服务器',
        possible: [
          '服务器防火墙阻止了LINE的IP段',
          '云服务商安全组未开放端口',
          '服务器地理位置限制',
          'TLS证书链不完整'
        ],
        action: [
          '检查云服务商安全组规则，确保31443端口开放给所有IP',
          '检查服务器防火墙: sudo ufw status 或 sudo iptables -L -n',
          '使用SSL Labs测试: https://www.ssllabs.com/ssltest/',
          '检查Nginx是否使用fullchain.pem'
        ]
      });
    }
  }

  if (suggestions.length === 0) {
    console.log('\n所有检查项均通过，TLS配置应该正常。');
    console.log('如果LINE测试仍然失败，可能是：');
    console.log('  1. LINE服务器IP被防火墙阻止');
    console.log('  2. 服务器地理位置限制');
    console.log('  3. 网络中间设备干扰');
  } else {
    suggestions.forEach((s, i) => {
      console.log(`\n问题${i + 1}: ${s.issue}`);
      console.log('  可能原因:');
      s.possible.forEach(p => console.log(`    - ${p}`));
      console.log('  建议操作:');
      s.action.forEach(a => console.log(`    - ${a}`));
    });
  }

  console.log('\n--- 服务器端检查命令 ---');
  console.log(`
# 1. 检查Nginx配置
sudo nginx -t
cat /etc/nginx/sites-enabled/default | grep -A 20 "listen 31443"

# 2. 检查SSL证书配置
grep -r "ssl_certificate" /etc/nginx/

# 3. 检查证书链
openssl s_client -connect abysshaven.online:31443 -servername abysshaven.online 2>&1 | head -50

# 4. 检查防火墙
sudo ufw status
sudo iptables -L -n | grep 31443

# 5. 检查Nginx日志
tail -100 /var/log/nginx/error.log
tail -100 /var/log/nginx/access.log

# 6. 检查端口监听
sudo netstat -tlnp | grep 31443
sudo ss -tlnp | grep 31443

# 7. 测试本地连接
curl -vk https://localhost:31443/openclaw/line/webhook
curl -vk https://127.0.0.1:31443/openclaw/line/webhook
`);
}

async function main() {
  console.log('开始系统性诊断...\n');

  await test1_DNSResolution();
  await test2_TCPConnection();
  await test3_TLSCertificateChain();
  await test4_TLSWithRejectFalse();
  await test5_HTTPSRequest();
  await test6_CipherSuites();
  await test7_TLSVersions();
  await test9_SNIValidation();
  await test8_LINEWebhookTest();

  await generateReport();
}

main();
