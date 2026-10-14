# 钓鱼真探 · 点亮黔中水

移动端优先的 Vue H5 + NestJS API。四个用户入口：**找钓位、我要点亮、活动看板、我的素材**，另有管理员工作台。

> 按本次沟通的最新范围实现：**点亮无需人工审核；贵州省界校验放到最后，当前未启用。** 原始确认版文档保留历史内容，冲突以 [当前功能说明](docs/功能说明.md) 为准。

## 本机运行

需要 Node.js 24、npm；此阶段不需要数据库、高德或天气 Key。

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

- H5：[http://127.0.0.1:5173](http://127.0.0.1:5173)
- API：[http://127.0.0.1:3100/api/health](http://127.0.0.1:3100/api/health)
- 管理台：[http://127.0.0.1:5173/admin](http://127.0.0.1:5173/admin)

`.env` 中设置至少 12 位 `ADMIN_PASSWORD`，重启 API 后，在登录面板切换“管理员登录”。没有默认管理密码。`DEV_AUTH=true` 仅在非 production 环境生效，供本机体验；它不是手机号或微信认证。开发账号靠当前 Cookie 会话关联，退出或会话丢失后不能凭同名昵称找回，勿用于正式运营。

首次启动：无水域、无出钓照片、无点亮、无榜单和公告。管理员录入真实水域后才能选择水域点亮；没有水域时可先保存照片与笔记、申请新水域。第一季时间为 **2026-11-01 00:00 至 2027-01-31 23:59:59.999，北京时间**；默认积分方案为关闭状态，示例分值需运营确认启用。

## 检查与构建

```powershell
npm run typecheck
npm test
npm run build
npm start
```

构建后 Nest 同时提供静态 H5 和 API，访问 [http://127.0.0.1:3100](http://127.0.0.1:3100)。测试使用独立临时数据与随机端口，不污染正式空数据。

## Docker

```powershell
# 先复制并修改 .env，至少设置 ADMIN_PASSWORD。
docker compose up -d --build app
```

访问 [http://127.0.0.1:3100](http://127.0.0.1:3100)。Compose 默认只绑定本机端口，数据和图片挂载独立卷。生产环境设 `NODE_ENV=production`、`DEV_AUTH=false`，配置 HTTPS 与 `COOKIE_SECURE=true`。正式钓友认证接入前，不应开放注册运营。

可选 PostgreSQL：见 [部署与配置](docs/部署与配置.md)。当前文件仓储适合本机 / 单实例开发；PostgreSQL 已提供事务型 JSONB 仓储，不等于完成 PostGIS 空间关系表迁移。

## 文档

- [功能说明与验收流程](docs/功能说明.md)
- [技术架构与接口](docs/技术架构.md)
- [部署、配置与数据维护](docs/部署与配置.md)
- [Linux 服务器部署（Docker + 域名）](docs/服务器部署.md)
- [GitHub 同步与三种发布命令](docs/GitHub发布流程.md)
- [实施状态与后续计划](docs/实施状态.md)

## 当前边界

真实地图需后配高德；天气可后配和风适配器；手机号 / 微信认证、对象存储适配器、省界限制、精细水域多边形覆盖、自动领奖履约为后续项。相机功能需要 HTTPS 或 localhost；本地拍摄界面不提供相册作为点亮证据，但普通 H5 无法从服务端证明画面一定来自真实现场，当前令牌和图片去重属于基础校验。
