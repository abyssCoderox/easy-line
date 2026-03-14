const https = require('https');
const tls = require('tls');

const ip = '1.12.70.250';
const hostname = 'dev.abysshaven.online';
const port = 443;

console.log('='.repeat(70));
console.log('IP地址 vs 域名 SSL/TLS 连接对比测试');
console.log('='.repeat(70));

async function testWithIP() {
  return new Promise((resolve) => {
    console.log('\n[测试1] 直接使用IP地址连接 (rejectUnauthorized: true)');
    console.log(`连接: ${ip}:${port}`);
    
    const options = {
      host: ip,
      port: port,
      path: '/bot/webhook',
      method: 'GET',
      rejectUnauthorized: true,
    };

    const req = https.request(options, (res) => {
      console.log('✅ 连接成功 (不应该发生)');
      console.log(`状态码: ${res.statusCode}`);
      resolve(true);
    });

    req.on('error', (err) => {
      console.log(`❌ 连接失败: ${err.message}`);
      console.log(`   错误码: ${err.code}`);
      
      if (err.code === 'ERR_TLS_CERT_ALTNAME_INVALID') {
        console.log('\n   原因: 证书的CN/SAN不包含IP地址');
        console.log('   证书是颁发给域名的，不是IP地址');
      }
      resolve(false);
    });

    req.setTimeout(10000, () => {
      console.log('❌ 超时');
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

async function testWithIPDisableVerify() {
  return new Promise((resolve) => {
    console.log('\n[测试2] 使用IP地址 + 禁用证书验证 (rejectUnauthorized: false)');
    console.log(`连接: ${ip}:${port}`);
    console.log('⚠️  警告: 禁用证书验证会降低安全性，仅用于测试！');
    
    const options = {
      host: ip,
      port: port,
      path: '/bot/webhook',
      method: 'GET',
      rejectUnauthorized: false,
    };

    const req = https.request(options, (res) => {
      console.log('✅ 连接成功 (证书验证已禁用)');
      console.log(`状态码: ${res.statusCode}`);
      
      const cert = res.socket.getPeerCertificate();
      console.log('\n   证书信息:');
      console.log(`   CN: ${cert.subject?.CN}`);
      console.log(`   SAN: ${cert.subject?.altNames?.join(', ') || '无'}`);
      console.log(`   注意: 证书CN是域名，不是IP`);
      
      resolve(true);
    });

    req.on('error', (err) => {
      console.log(`❌ 连接失败: ${err.message}`);
      resolve(false);
    });

    req.setTimeout(10000, () => {
      console.log('❌ 超时');
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

async function testWithIPAndSNI() {
  return new Promise((resolve) => {
    console.log('\n[测试3] 使用IP地址 + SNI (Server Name Indication)');
    console.log(`连接: ${ip}:${port}`);
    console.log(`SNI主机名: ${hostname}`);
    
    const options = {
      host: ip,
      port: port,
      path: '/bot/webhook',
      method: 'GET',
      servername: hostname,
      headers: {
        'Host': hostname,
      },
    };

    const req = https.request(options, (res) => {
      console.log('✅ 连接成功！');
      console.log(`状态码: ${res.statusCode}`);
      
      const cert = res.socket.getPeerCertificate();
      console.log('\n   证书信息:');
      console.log(`   CN: ${cert.subject?.CN}`);
      console.log(`   颁发者: ${cert.issuer?.CN}`);
      
      resolve(true);
    });

    req.on('error', (err) => {
      console.log(`❌ 连接失败: ${err.message}`);
      resolve(false);
    });

    req.setTimeout(10000, () => {
      console.log('❌ 超时');
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

async function testWithTLSConnect() {
  return new Promise((resolve) => {
    console.log('\n[测试4] 使用 tls.connect() + SNI');
    console.log(`连接: ${ip}:${port}`);
    
    const socket = tls.connect({
      host: ip,
      port: port,
      servername: hostname,
    }, () => {
      console.log('✅ TLS握手成功！');
      console.log(`协议: ${socket.getProtocol()}`);
      console.log(`加密套件: ${socket.getCipher()?.name}`);
      
      const cert = socket.getPeerCertificate();
      console.log('\n   证书验证通过:');
      console.log(`   CN: ${cert.subject?.CN}`);
      console.log(`   颁发者: ${cert.issuer?.CN}`);
      console.log(`   authorized: ${socket.authorized}`);
      
      socket.destroy();
      resolve(true);
    });

    socket.on('error', (err) => {
      console.log(`❌ TLS握手失败: ${err.message}`);
      resolve(false);
    });

    socket.setTimeout(10000, () => {
      console.log('❌ 超时');
      socket.destroy();
      resolve(false);
    });
  });
}

async function main() {
  console.log('\n说明:');
  console.log('- SSL证书通常颁发给域名，不是IP地址');
  console.log('- 证书的CN(通用名称)和SAN(主题备用名称)包含域名列表');
  console.log('- 使用IP连接时，证书验证会失败，因为IP不在证书的域名列表中');
  console.log('- 解决方案: 使用SNI (Server Name Indication) 告诉服务器我们要访问的域名');

  await testWithIP();
  await testWithIPDisableVerify();
  await testWithIPAndSNI();
  await testWithTLSConnect();

  console.log('\n' + '='.repeat(70));
  console.log('结论');
  console.log('='.repeat(70));
  console.log(`
1. 直接用IP连接 (rejectUnauthorized: true)
   ❌ 会失败，因为证书不包含IP地址

2. 用IP连接 + 禁用验证 (rejectUnauthorized: false)
   ⚠️  可以连接，但不安全，容易遭受中间人攻击

3. 用IP连接 + SNI (servername: 域名)
   ✅ 推荐方案！
   - 通过SNI告诉服务器目标域名
   - 证书验证会使用SNI中的域名
   - 安全且有效

4. LINE Webhook 场景
   - LINE服务器会使用域名访问你的webhook
   - 只要域名证书配置正确即可
   - 不需要担心IP访问问题
`);
}

main();
