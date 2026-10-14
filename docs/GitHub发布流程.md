# 本地 → GitHub → Linux 服务器

## 首次连接 GitHub

当前项目尚未初始化 Git，也未设置远程仓库。先在 GitHub 创建空的私有仓库，然后在本地项目根目录执行（替换仓库地址）：

```powershell
git init -b main
git add .
git status --short
git commit -m "Initial application"
git remote add origin git@github.com:你的账号/你的仓库.git
git push -u origin main
```

本地使用自己的 GitHub SSH 密钥；服务器使用该仓库的只读 Deploy Key。不要把访问令牌、密码或私钥写进远程 URL、脚本或仓库。

`.gitignore` 排除了依赖、构建产物、真实环境配置、数据库文件、上传图片、本地证书、日志、备份和发布产物；两份 `.env.*.example` 模板保留。首次提交前检查 `git status`。忽略规则不会移除已经被 Git 跟踪的敏感文件。

## 服务器首次准备

域名解析、公网端口与 HTTPS 要求见 [服务器部署](服务器部署.md)。服务器安装 Docker Compose、Git 和 `flock`（通常由 util-linux 提供），配置只读 GitHub Deploy Key，并克隆仓库：

```bash
git clone --branch main git@github.com:你的账号/你的仓库.git /opt/gofishing
cd /opt/gofishing
cp .env.server.example .env
chmod 600 .env
```

填写 `.env` 中的真实域名和管理密码，保留生产模式与 Secure Cookie。服务端目录应是专用部署目录，不在其中修改受 Git 跟踪的文件。

## 每次本地发布

先运行与改动相关的检查，再提交并推送：

```powershell
npm run typecheck
npm test
npm run build
git add .
git commit -m "Describe this release"
git push origin main
powershell -ExecutionPolicy Bypass -File scripts/New-Release.ps1 -Mode all
```

最后一条命令生成 `.releases/publish-提交号-all.sh`。生成器要求工作区干净，且本地提交与 GitHub 分支一致。`-Mode` 可以是 `all`、`server`、`web`；生成的脚本也允许在执行时选择这三种模式。脚本含固定提交号，不含服务器凭据或业务密钥。

把生成的脚本复制到服务器任意位置（例如 `/tmp/`），再执行其中一种命令：

```bash
bash /tmp/publish-提交号-all.sh all /opt/gofishing
bash /tmp/publish-提交号-all.sh server /opt/gofishing
bash /tmp/publish-提交号-all.sh web /opt/gofishing
```

也可不生成脚本，直接在服务器项目目录独立执行：

```bash
bash scripts/deploy.sh all
bash scripts/deploy.sh server
bash scripts/deploy.sh web
```

直接执行会发布 GitHub `main` 最新提交；生成脚本只允许发布生成时的提交。如果 GitHub 分支已有更新，生成脚本会停止，应在本地重新生成。脚本拒绝服务端脏工作区、非快进更新和并发发布，不会强制覆盖代码。

## 三种模式的实际行为

| 命令 | 更新内容 | 保留内容 |
| --- | --- | --- |
| all | 构建后端、前端和运行依赖 | 数据与图片卷 |
| server | 构建后端及运行依赖 | 当前容器镜像中的前端文件、数据卷 |
| web | 构建前端 | 当前容器镜像中的后端和运行依赖、数据卷 |

首次必须全量发布。三种模式都会生成独立版本镜像并重启应用容器，存在短暂中断；界面发布也会导致内存登录会话失效。前后端共享接口、共享类型或交互规则一起变更时，应全量发布。脚本会更新并重建 Caddy 入口容器以应用当前入口配置。

脚本先成功构建，再替换运行容器；等待后端健康检查通过后记录 `.release.env` 和 `.releases/` 发布清单。启动或健康检查失败时尝试恢复上一应用镜像；这不回滚数据库与已经发生的业务写入，正式升级前仍需备份。初次发布失败没有上一版可恢复。

## 查看状态与回滚

日常运维使用同一组 Compose 文件及已记录的镜像：

```bash
docker compose --env-file .env --env-file .release.env -f compose.yaml -f compose.server.yaml -f compose.release.yaml ps
docker compose --env-file .env --env-file .release.env -f compose.yaml -f compose.server.yaml -f compose.release.yaml logs --tail=100 app caddy
curl -fsS https://你的域名/api/health
```

镜像历史及上一镜像标签在 `.releases/*.txt`。需要手动回滚时，将 `.release.env` 的 `RELEASE_IMAGE` 改为目标旧镜像标签，再执行：

```bash
docker compose --env-file .env --env-file .release.env -f compose.yaml -f compose.server.yaml -f compose.release.yaml up -d --no-build --no-deps app
```

不要使用 `down -v`，也不要在确认回滚窗口结束前清理旧镜像。代码拉取和镜像升级不会搬迁电脑上的水域档案、图片或密钥配置。

## 是否需要 Nginx

本项目已使用 Caddy 提供反向代理、免费 HTTPS 和自动续期，无需额外 Nginx。如果服务器已经用 Nginx / 宝塔管理其他站点，应复用现有 Nginx，转发到 `127.0.0.1:3100` 并保留 Host / Origin；当前脚本包含 Caddy，不能直接与占用 80 / 443 的现有入口同时使用，需先调整入口配置。

生产模式下普通钓友真实登录仍未接入；部署成功不代表已满足公开运营条件。

## 本次验证范围

已通过 Bash / PowerShell 语法检查和三份 Compose 文件合并校验；使用隔离的命令替身验证了全量、后端、界面发布路径、健康失败回退和首次局部发布拦截。当前本机 Docker 引擎未运行，尚未实际构建发布镜像或在 Linux 服务器执行；GitHub 远程地址也尚未配置。
