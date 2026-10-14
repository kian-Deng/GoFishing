import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const certs = fileURLToPath(new URL('../dev-certs/', import.meta.url));
const publicDir = fileURLToPath(new URL('../apps/web/public/', import.meta.url));
const mobileIp = process.argv[2] || '192.168.137.1';
if (isIP(mobileIp) !== 4) throw new Error('请传入电脑热点的 IPv4 地址，例如 192.168.137.1');
mkdirSync(certs, { recursive: true });
mkdirSync(publicDir, { recursive: true });
writeFileSync(`${certs}openssl.cnf`, '[req]\ndistinguished_name=req_distinguished_name\n[req_distinguished_name]\n');

function openssl(args) {
  execFileSync('openssl', args, {
    cwd: certs,
    env: { ...process.env, OPENSSL_CONF: `${certs}openssl.cnf` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

if (!existsSync(`${certs}ca.key`) || !existsSync(`${certs}ca.crt`)) {
  openssl([
    'req', '-x509', '-newkey', 'rsa:3072', '-sha256', '-days', '730', '-nodes',
    '-keyout', 'ca.key', '-out', 'ca.crt', '-subj', '/CN=GoFishing Local Dev CA',
    '-addext', 'basicConstraints=critical,CA:TRUE',
    '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
    '-addext', 'subjectKeyIdentifier=hash',
  ]);
}

openssl([
  'req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'server.key', '-out', 'server.csr',
  '-subj', `/CN=${mobileIp}`,
]);
writeFileSync(
  `${certs}server.ext`,
  `basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:${mobileIp},IP:127.0.0.1,DNS:localhost\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n`,
);
openssl([
  'x509', '-req', '-in', 'server.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key',
  '-CAcreateserial', '-out', 'server.crt', '-days', '90', '-sha256', '-extfile', 'server.ext',
]);
openssl(['x509', '-in', 'ca.crt', '-outform', 'DER', '-out', 'ca.der']);

const payload = readFileSync(`${certs}ca.der`).toString('base64');
const profileId = randomUUID();
const certificateId = randomUUID();
const profile = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>PayloadContent</key><array><dict>
<key>PayloadCertificateFileName</key><string>GoFishing Local Dev CA</string>
<key>PayloadContent</key><data>${payload}</data>
<key>PayloadDescription</key><string>Trust certificate for local GoFishing HTTPS development</string>
<key>PayloadDisplayName</key><string>GoFishing Local Dev CA</string>
<key>PayloadIdentifier</key><string>dev.gofishing.local.certificate</string>
<key>PayloadType</key><string>com.apple.security.root</string>
<key>PayloadUUID</key><string>${certificateId}</string>
<key>PayloadVersion</key><integer>1</integer>
</dict></array>
<key>PayloadDescription</key><string>Only for local GoFishing development on your own hotspot</string>
<key>PayloadDisplayName</key><string>GoFishing Local Development</string>
<key>PayloadIdentifier</key><string>dev.gofishing.local.profile</string>
<key>PayloadOrganization</key><string>GoFishing Local Development</string>
<key>PayloadType</key><string>Configuration</string>
<key>PayloadUUID</key><string>${profileId}</string>
<key>PayloadVersion</key><integer>1</integer>
</dict></plist>
`;
writeFileSync(`${publicDir}gofishing-dev-ca.mobileconfig`, profile);
console.log(`开发证书已生成。手机证书下载：http://${mobileIp}:5174/gofishing-dev-ca.mobileconfig`);
console.log(`信任证书后打开：https://${mobileIp}:5175/`);
