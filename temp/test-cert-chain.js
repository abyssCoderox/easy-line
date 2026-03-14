const https = require('https');
const tls = require('tls');

const hostname = 'abysshaven.online';
const port = 31443;

console.log('='.repeat(70));
console.log('SSL证书链检查');
console.log('='.repeat(70));
console.log(`目标: ${hostname}:${port}`);
console.log('='.repeat(70));

async function checkCertificateChain() {
  return new Promise((resolve) => {
    console.log('\n[1] 检查证书链完整性');
    
    const socket = tls.connect({
      host: hostname,
      port: port,
      servername: hostname,
      rejectUnauthorized: true,
    }, () => {
      console.log('✅ TLS连接成功');
      console.log(`   授权状态: ${socket.authorized ? '已授权' : '未授权'}`);
      
      if (!socket.authorized) {
        console.log(`   授权错误: ${socket.authorizationError}`);
      }
      
      const cert = socket.getPeerCertificate();
      console.log('\n[2] 服务器证书信息');
      console.log(`   主体(CN): ${cert.subject?.CN || 'N/A'}`);
      console.log(`   颁发者: ${cert.issuer?.CN || 'N/A'}`);
      console.log(`   O: ${cert.issuer?.O || 'N/A'}`);
      console.log(`   有效期: ${new Date(cert.valid_from).toISOString()} ~ ${new Date(cert.valid_to).toISOString()}`);
      
      if (cert.issuerCertificate) {
        console.log('\n[3] 中间证书信息');
        const issuer = cert.issuerCertificate;
        console.log(`   主体: ${issuer.subject?.CN || 'N/A'}`);
        console.log(`   颁发者: ${issuer.issuer?.CN || 'N/A'}`);
        
        if (issuer.issuerCertificate && issuer.issuerCertificate !== issuer) {
          console.log('\n[4] 根证书信息');
          const root = issuer.issuerCertificate;
          console.log(`   主体: ${root.subject?.CN || 'N/A'}`);
        }
      } else {
        console.log('\n⚠️  未找到中间证书信息');
        console.log('   这可能表示证书链不完整');
      }
      
      socket.destroy();
      resolve(true);
    });

    socket.on('error', (err) => {
      console.log(`❌ TLS连接失败: ${err.message}`);
      console.log(`   错误码: ${err.code}`);
      
      if (err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
        console.log('\n   可能原因: 证书链不完整，缺少中间证书');
      } else if (err.code === 'CERT_HAS_EXPIRED') {
        console.log('\n   可能原因: 证书已过期');
      } else if (err.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
        console.log('\n   可能原因: 自签名证书');
      }
      
      resolve(false);
    });

    socket.setTimeout(15000, () => {
      console.log('❌ 连接超时');
      socket.destroy();
      resolve(false);
    });
  });
}

async function testWithRejectUnauthorizedFalse() {
  return new Promise((resolve) => {
    console.log('\n[5] 禁用证书验证测试');
    
    const socket = tls.connect({
      host: hostname,
      port: port,
      servername: hostname,
      rejectUnauthorized: false,
    }, () => {
      console.log('✅ 连接成功 (验证已禁用)');
      
      const cert = socket.getPeerCertificate();
      console.log(`   证书CN: ${cert.subject?.CN}`);
      console.log(`   颁发者: ${cert.issuer?.CN}`);
      console.log(`   授权错误: ${socket.authorizationError || '无'}`);
      
      socket.destroy();
      resolve(true);
    });

    socket.on('error', (err) => {
      console.log(`❌ 失败: ${err.message}`);
      resolve(false);
    });

    socket.setTimeout(15000, () => {
      console.log('❌ 超时');
      socket.destroy();
      resolve(false);
    });
  });
}

async function main() {
  await checkCertificateChain();
  await testWithRejectUnauthorizedFalse();

  console.log('\n' + '='.repeat(70));
  console.log('诊断结果');
  console.log('='.repeat(70));
  console.log(`
常见问题及解决方案:

1. 证书链不完整
   - 确保服务器配置包含完整的证书链
   - Nginx: ssl_certificate 应包含服务器证书+中间证书
   - Apache: SSLCertificateChainFile 配置中间证书

2. Let's Encrypt 证书
   - 使用 fullchain.pem 而不是 cert.pem
   - fullchain.pem 包含完整证书链

3. LINE Webhook 要求
   - 必须使用有效的 SSL 证书
   - 证书链必须完整
   - 必须使用域名 (不能用IP)
`);
}

main();
