# Qoder Daily Claim

**在 Windows 上自动领取 Qoder 每日免费额度。**

Qoder 每天给个人用户 **100 Credits**，但必须在应用里手动点击领取。错过领取窗口，当天的额度就没了。
这个项目替你做这一次点击，每天按计划自动执行。

[English](../README.md) · [中文](README.zh-CN.md) · [فارسی](README.fa.md)

---

## 这是什么（以及不是什么）

Qoder 官方文档明确说明：每日奖励**必须手动领取**，没有公开 API。本项目只是把你本来要手动做的那一次
领取自动化了 —— 它不会刷取额外额度、不会批量注册账号、也不会绕过任何限制。

> 使用前请先阅读[官方规则](https://docs.qoder.com/events/100credits)。
> 如何使用由你自己负责。

## 工作原理

Qoder 是 Electron 应用，所以领取界面本身就是可驱动的网页内容：

1. **真实 UI 路径。** 脚本点击侧边栏底部的个人资料按钮，再点击弹出菜单中的 **Rewards center**。
2. **活动页面。** 这会以 iframe 形式打开
   `https://openapi.qoder.sh/growth-page/activity-iframe`，在 CDP 中表现为一个 `iframe` target。
3. **领取。** 脚本在该 iframe 内找到 **「Claim 100 Credits Daily」** 卡片上处于可用状态的
   **Claim** 按钮并点击，然后验证页面显示
   *「Claimed successfully. Credits have been added.」*。

整个过程运行在应用真实的登录会话中，**不会读取、存储或传输任何 token 或 cookie**。

> **为什么不用 IPC 捷径？** Qoder 通过 IPC 暴露了 `openCampaignSurface()`，本项目早期版本用的就是它。
> 但那条路径会让页面永远卡在 *「Connecting to Qoder Desktop…」*，因为宿主桥只有在窗口从真实菜单打开时
> 才会被接上。所以脚本改为驱动菜单，和人手动操作完全一致。

```
个人资料按钮  ──►  「Rewards center」  ──►  活动 iframe
                                              │
                                              ▼
                              找到每日卡片 → 点击 Claim
                                              ▼
                              验证「Claimed successfully」→ 写日志
```

## 环境要求

- **Windows 10/11**（计划任务使用 Windows 任务计划程序与 PowerShell）
- **Node.js 18+** —— [nodejs.org](https://nodejs.org)（用 `node --version` 检查）
- **Qoder 桌面应用**，已安装并已登录

## 安装

```powershell
git clone https://github.com/jalilahmad/qoder-daily-claim.git
cd qoder-daily-claim

# 注册每日计划任务
powershell -ExecutionPolicy Bypass -File scripts/install-task.ps1
```

安装脚本会自动换算成你所在时区的正确时间。Qoder 的领取窗口在**新加坡时间（UTC+8）每天 10:00**
开启，任务安排在开启后 15 分钟执行。

输出示例：

```
Computed local claim time: 06:45 (10:15 UTC+8 in your timezone)

Registered scheduled task: Qoder Daily Credit Claim
  Runs daily at 06:45 (local), retrying hourly for 4 hours.
```

## 使用

### 立即执行一次

```powershell
# 立即领取，完成后关闭 Qoder
powershell -ExecutionPolicy Bypass -File scripts/run-claim.ps1

# 立即领取，保持 Qoder 打开
powershell -ExecutionPolicy Bypass -File scripts/run-claim.ps1 -KeepOpen
```

### 查看结果

```powershell
Get-Content claim-log.txt -Tail 20
```

成功的一次运行长这样：

```
[2026-11-16T02:45:12.331Z] --- run start ---
[2026-11-16T02:45:13.104Z] status: claimable=true url=https://openapi.qoder.sh/growth-page/activity-iframe
[2026-11-16T02:45:13.882Z] open surface: {"ok":true}
[2026-11-16T02:45:16.220Z] campaign frame: https://openapi.qoder.sh/growth-page/activity-iframe
[2026-11-16T02:45:18.004Z] click: {"clicked":true,"via":"daily-card","label":"claim"}
[2026-11-16T02:45:25.117Z] post-status: claimable=false
[2026-11-16T02:45:25.118Z] RESULT: claim succeeded
```

### 管理计划任务

```powershell
# 查看状态与上次结果
Get-ScheduledTask -TaskName "Qoder Daily Credit Claim" | Get-ScheduledTaskInfo

# 立即运行
Start-ScheduledTask -TaskName "Qoder Daily Credit Claim"

# 修改执行时间
powershell -ExecutionPolicy Bypass -File scripts/install-task.ps1 -Time "07:30"

# 删除任务
powershell -ExecutionPolicy Bypass -File scripts/install-task.ps1 -Uninstall
```

## 配置参数

| 参数 | 默认值 | 说明 |
|---|---|---|
| `-Port` | `9222` | 与 Qoder 通信的本地 DevTools 端口 |
| `-QoderPath` | 自动检测 | 自动检测失败时，显式指定 `Qoder.exe` 路径 |
| `-KeepOpen` | 关闭 | 领取后保持 Qoder 运行 |
| `-StartupWaitSec` | `40` | 等待 Qoder DevTools 端点就绪的秒数 |

## 退出码

| 代码 | 含义 |
|---|---|
| `0` | 领取成功，**或**当前无可领取项（今天已领取 / 无活动） |
| `1` | 出错，或无法确认领取结果 |

## 重要注意事项

- **Qoder 会被重启。** 脚本需要 Qoder 以 `--remote-debugging-port=9222` 启动。如果 Qoder 已在运行
  但没有该参数，脚本会重启它。Qoder 会恢复会话，但未保存的进行中工作有风险 —— 所以任务安排在清晨。
- **调试端口仅限本机。** 它绑定在 `127.0.0.1:9222`，不对外网开放。但当 Qoder 带着该端口运行时，
  本机任何进程都能操控该应用。因此脚本默认在完成后关闭 Qoder（除非传入 `-KeepOpen`）。
- **界面改动会导致失效。** 每日卡片通过文本 `Claim 100 Credits Daily` 定位。若 Qoder 改版，
  请更新 `src/qoder-claim.js` 中的 `FRAME_CLICK`。届时日志会显示 `claim control not found`。
- **验证是诚实的。** 只有当应用自身状态变为 `hasClaimableCampaign: false` 或页面显示 "Claimed"
  时才报告成功，否则以 `1` 退出并如实说明。
- **不处理任何凭据。** 脚本从不读取、存储或发送你的 token 或 cookie，只是驱动已登录的应用。

## 常见问题

**`Qoder renderer page not found`**
Qoder 没有带调试端口运行。请通过 `scripts/run-claim.ps1` 启动，而不是直接运行
`node src/qoder-claim.js`。

**`campaign surface never rendered`**
活动窗口没有打开。手动打开 Qoder，点击侧边栏底部的个人资料名称，选择 **Rewards center**，
确认该窗口在你的网络下能正常加载。

**`claim control not found`**
Qoder 改了界面。请附上 `claim-log.txt` 的内容开一个 issue。

**任务执行了但什么都没发生**
确认任务上次结果为 `0`，并查看 `run-log.txt`。如果当时 Qoder 正在更新，下一小时的自动重试会补上。

## 项目结构

```
qoder-daily-claim/
├── src/
│   ├── cdp.js           # 极简 Chrome DevTools Protocol 客户端（零依赖）
│   └── qoder-claim.js   # 领取逻辑：查询状态 → 打开界面 → 点击 → 验证
├── scripts/
│   ├── run-claim.ps1    # 带调试端口启动 Qoder 并执行领取
│   └── install-task.ps1 # 注册/删除每日计划任务
├── docs/
│   ├── README.zh-CN.md  # 中文说明
│   └── README.fa.md     # 波斯语说明
├── package.json
├── LICENSE
└── README.md
```

## 参与贡献

欢迎提交 issue 和 pull request，尤其是：
- Qoder 改版时的选择器更新，
- macOS / Linux 支持（领取逻辑本身跨平台，只有调度部分是 Windows 专用），
- 更可靠的领取结果验证方式。

请保持本项目的初衷：每个窗口只做一次诚实的领取，不自动化任何被 Qoder 规则禁止的行为。

## 许可证

[MIT](../LICENSE)

## 免责声明

这是一个非官方社区项目，与 Qoder 无隶属关系，也未获其认可或支持。Qoder 的条款与活动规则可能随时变更，
请自行确保你的使用方式符合这些规则。
