# ForensicDSH — 便携式 AI 取证工作站（改装源）

把一套**免安装的便携 AI 助手**改装成「插上 U 盘即可用、以自然语言驱动取证」的取证工作站：
独立签入（姓名 + 身份证 + 密码）、工作区与**固证区**分离（固证区 AI 只读）、内置取证角色与技能、
可一键发放带独立设备身份的新盘。

> **这是什么关系**：本仓库是社区**改装层（overlay + 脚本 + 文档）**，不含上游任何源码，
> 与 DeepSeek / USB-Harness 官方均无隶属关系。
>
> **使用前需自备基座**（本仓库不含动辄数百 MB 的便携运行时）：
> 到 [USB-Harness Releases](https://github.com/tmy2623231/USB-Harness/releases/latest) 下载
> `USB-Harness-with-runtime.zip`，解压后放到本目录同级，成为 `<盘根>\USB-Harness-with-runtime`。
>
> 上游致谢：便携基座 [USB-Harness](https://github.com/tmy2623231/USB-Harness)（MIT）·
> AI 框架 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。

---

## 一、工具定位

**它是什么**

- 一个可放到 U 盘里、免安装运行的**本地 AI 取证工作站**：AI 框架、运行时、取证工具与脚本都在盘内。
- 面向「现场/主机取证 + 镜像分析」的**辅助**工具：用自然语言指挥 AI 完成查询、解析、时间线整理与报告草拟。
- 可**复制发放**：制作一次母盘，即可复制出任意多枚带独立设备编号的新盘。

**它不是什么 / 能力边界**

- **不是取证结论的最终裁决者**：AI 产出属于辅助线索，须由持证人员复核、按法定程序固定证据。
- 不是「开箱即用的一体机」：需要自备便携基座；本仓库只提供改装层。
- 固证区的「只读」是**两层防线**（软件守卫 + NTFS 权限），但**管理员/SYSTEM 可绕过**；请配合加密盘与规范流程使用。
- 工具总线的执行**不经 shell**（无注入面），但工具本身的能力 = 你放进去的二进制；请自行甄别来源与许可。

**适用场景**：Windows 现场快速排查、注册表/日志/浏览器痕迹解析、磁盘镜像的初步检视、案件时间线整理。

---

## 二、目录结构

```
forensic-stick/                     ← 本仓库（改装源）
├── install.ps1                     把取证层装进一个 USB-Harness 基座（并重建模块链接）
├── prepare-stick.ps1               建三区 + 写盘标记 + 锁固证区（只读）
├── New-Operator.ps1                新建操作员（姓名 + 身份证 + 密码/PIN）
├── New-Stick.ps1                   从母盘发放新盘（软件复制、身份不复制）
├── Repair-Stick.ps1                重建插件模块链接（复制母盘后修复用）
├── tools/
│   ├── provision.mjs               发放底层：plan / new-device / device / validate
│   └── operator-cli.mjs            操作员名单读写
├── overlay/                        ★ 改装层（会被 install.ps1 拷到盘上）
│   ├── packages/                    6 个取证插件（core / auth / policy / tools / ui / bundle）
│   ├── presets/forensic/            取证 AI 角色预设
│   ├── brand/                       界面品牌覆盖
│   └── harness/forensic/
│       ├── tools/external/          ★ 取证工具投放目录（见第五节）
│       └── skills/                  取证技能（方法论提示）
├── tests/                           单元测试（一键 run-all.mjs）
└── docs/                            使用说明、第三方许可、开发记录
```

盘上布局（运行时侧）：

```
<盘根>\
├── USB-Harness-with-runtime\   工作区：基座 + 取证层 + forensic/tools、forensic/skills
├── 固证区\                       原始证据：只进不改，AI 只读
├── 案件区\                       案件记录与工作副本（可写）
├── device\                      本盘身份（device.json / device.key），不随复制
├── config\                      操作员名单、会话密钥
└── forensic-stick.json          盘标记（程序据此识别盘根）
```

---

## 三、快速开始

```
1) 准备基座：把 USB-Harness-with-runtime 放到本仓库同级，使其成为
   <盘根>\USB-Harness-with-runtime
2) 装取证层：  powershell -ExecutionPolicy Bypass -File .\install.ps1 -Target <盘根>\USB-Harness-with-runtime
3) 初始化三区：powershell -ExecutionPolicy Bypass -File .\prepare-stick.ps1 -StickRoot <盘根>
4) 建操作员：  powershell -ExecutionPolicy Bypass -File .\New-Operator.ps1 -Name 张三 -Id 110101199001011234 -Password 1234
5) 启动：      双击 <盘根>\USB-Harness-with-runtime\launch.bat，浏览器打开后登录
```

> 建议 U 盘为 **NTFS**（模块链接与固证区 ACL 都依赖它）。

---

## 四、使用教程

### 4.1 制作母盘（做一次）

按上面「快速开始」1–4 步即可。母盘 = 装好取证层 + 建好操作员名单的那枚盘，**是后续复制的唯一真源**。

- `install.ps1` 会把 `overlay/` 拷贝进基座，并把取证 bundle 挂进 profile；
- `prepare-stick.ps1` 建立 `固证区/案件区/device`、写盘标记，并给 `固证区` 与 `device` 加**只读 ACL**。

### 4.2 建操作员（可多人）

```powershell
powershell -ExecutionPolicy Bypass -File .\New-Operator.ps1 -Name 张三 -Id 110101199001011234 -Password 1234
```
- 身份证号与密码**只存哈希**（PBKDF2-SHA256），名单在 `config/operators.json`；
- 中文参数请经脚本传入（已处理编码）；
- **名单为空时登录门禁自动关闭**（防止把人锁死），母盘请至少建一名。

### 4.3 发放新盘

```powershell
powershell -ExecutionPolicy Bypass -File .\New-Stick.ps1 -Source <母盘盘根> -Target <新盘盘根>
powershell -ExecutionPolicy Bypass -File .\prepare-stick.ps1 -StickRoot <新盘盘根>   # 新盘需再上锁一次
```
- **软件复制、身份不复制**：不复制 `device/`、会话密钥、固证区、会话数据；
- 新盘自动获得**全新设备编号**（形如 `FRS-2026-000001`）；
- 发放后会自动校验并**重建模块链接**。若你改用资源管理器整盘拷贝，先让复制 100% 完成，再跑一次
  `Repair-Stick.ps1 -StickRoot <目标盘根>`。

> **放工具只需放一次**：工具目录 `forensic\tools\` 在 runtime 内，属于「软件」，复制母盘时会**自动带过去**，
> 无需每盘再放（详见 4.5）。

### 4.4 日常使用

1. 双击 `launch.bat` → 浏览器打开 → 输入**姓名 + 身份证 + 密码**登录；
2. 用自然语言下达任务，例如「分析这台机器的 USB 使用记录并生成时间线」；
   （设备编号 / 三区路径 / 已就绪工具可从数据接口 `GET /forensic/info` 查看。）
3. 往固证区投放证据前临时解锁、投完立即上锁：
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\prepare-stick.ps1 -StickRoot <盘根> -Unlock   # 解锁
   # …… 放入证据 ……
   powershell -ExecutionPolicy Bypass -File .\prepare-stick.ps1 -StickRoot <盘根>            # 上锁
   ```

### 4.5 添加取证工具（重点）

工具总线在启动时扫描 `forensic\tools\**\manifest.json`，把每个工具注册为模型可见的 `forensic_<id>`。
**参数按清单声明顺序拼成命令行、不经 shell**。

**放哪里**

- **开发/源**：`overlay/harness/forensic/tools/external/<工具>/`（`install.ps1` 会拷到盘上）；
- **盘上**：`<盘根>\USB-Harness-with-runtime\forensic\tools\external\<工具>/`（直接生效）。
- 由于该目录在 runtime 内，**母盘放一次，之后复制的新盘都会带上**。

**清单最小形态**

```json
{
  "id": "usb-history",
  "name": "USB History Extractor",
  "version": "1.0.0",
  "description": "从 SYSTEM hive 提取 USB 连接历史。",
  "executable": { "windows": "usb-history.exe" },
  "args": [
    { "name": "evidence", "type": "string", "required": true, "description": "SYSTEM hive 路径" }
  ],
  "timeout_ms": 300000
}
```

**参数三种写法**（`args` 里每一项）

| 写法 | 效果 | 例 |
|---|---|---|
| 位置参数（默认） | `<值>` | `fls image.dd` |
| 带值选项 `"flag": "--csv"` | `--csv <值>` | `MFTECmd -f a.bin --csv out` |
| 等号选项 `"flag":"--json","style":"equals"` | `--json=<值>` | `tool --json=x` |
| 开关 `"type":"boolean"` | 为 true 时输出该名（或 `"flag"`） | `-accepteula`、`-r` |

**多个工具共用一套二进制**（省空间）：把公共二进制放一个 `bin/`，各清单用 `..` 指过去：

```
external/sleuthkit/
├── bin/                # fls.exe/icat.exe/... 及依赖 DLL（无 manifest，不注册）
├── fls/manifest.json   # { "executable": { "windows": "../bin/fls.exe" } }
└── mmls/manifest.json
```

**加完后**：重启 `launch.bat` 即可；工具出现在侧栏面板，模型可调用 `forensic_<id>`。
只放清单、缺二进制时，会显示在「待投放二进制」里，不会被注册。

### 4.6 添加取证技能

技能是给 AI 的方法论提示，放在 `harness/forensic/skills/<域>/<名字>/SKILL.md`，随 runtime 复制。

### 4.7 更新已发出的盘

工具/插件有更新时，把改动并入母盘后重新复制；或对单枚盘：
`install.ps1 -Target <盘根>\USB-Harness-with-runtime` 覆盖插件层，再 `Repair-Stick.ps1 -StickRoot <盘根>`。

---

## 五、内置与可扩展工具

**仓库内置（可直接用，均为可再分发许可，见 `docs/THIRD_PARTY.md`）**

| 工具 | 用途 | 形态 |
|---|---|---|
| **osquery** | 本机实时状态 SQL 查询（进程/服务/网络/用户/自启/计划任务…），`--json` 输出 | 单 exe，Apache-2.0 |
| **Sleuth Kit CLI**（`fls`/`mmls`/`fsstat`/`icat`） | 磁盘/文件系统与镜像检视 | exe+DLL（共享 `bin/`），CPL/IPL |
| **WinPmem** | 物理内存采集（需管理员） | 单 exe，Apache-2.0 |

**已备清单、需自行投放二进制**

| 工具 | 用途 | 许可/说明 |
|---|---|---|
| **EZ Tools**（`MFTECmd`/`EvtxECmd`/`PECmd`/`JLECmd`） | NTFS/事件日志/Prefetch/JumpList 解析 | MIT；需 .NET，见 `external/ez-tools/README.md` |

**仅给链接（许可不允许随仓库再分发）**

| 类别 | 推荐 | 链接 |
|---|---|---|
| 内存获取 | Magnet DumpIt / RAM Capture | 官方页面（专有免费） |
| 内存分析 | Volatility 3 | github.com/volatilityfoundation/volatility3（VSL） |
| 浏览器 | Hindsight / BrowsingHistoryView | github.com/RyanDFIR/hindsight（Apache-2.0）；nirsoft.net |
| 即时通讯 | Telegram：tgartifacts / telegram-desktop-decrypt | github.com/Dmeetrogon/TGArtifacts；github.com/atilaromero/telegram-desktop-decrypt（MIT） |

---

## 六、安全模型

| 目标 | 结果 | 手段 |
|---|---|---|
| 工作区 / 案件区 | 读+写 | 会话 workspace |
| **固证区** | **只读** | 单调守卫（写类拒绝、读放行）+ NTFS `DENY(WD,AD,WEA,WA,DE,DC)` |
| 凭据 / 设备密钥 | 拒绝 | 守卫拒绝 `device.key`、`.credentials.yaml` |
| 任意 shell / 联网检索 | 拒绝 | 取证预设不含 pwsh/bash/web 工具 |
| 未注册工具 | 拒绝 | 工具总线只跑清单声明、且落在工具根内的可执行文件 |

> 前端登录门禁是**体验层**；网络侧访问控制由基座自带 browser-trust token 栅栏承担。
> 固证区 ACL **不用通用 `W`**（其含 `SYNCHRONIZE`，会让程序连读都失败）。

---

## 七、排错

| 现象 | 处理 |
|---|---|
| 启动报 `plugin tree failed to load` / `Cannot find package ...\profiles\node_modules\...` | 复制母盘后链接退化；直接启动会自动重建，或跑 `Repair-Stick.ps1 -StickRoot <盘根>` |
| 启动报 `EINVAL: mkdir '...\固证区'` | 旧版 ACL 掩码；重跑 `prepare-stick.ps1 -StickRoot <盘根>` 就地修复 |
| 登录成功却停在登录页 | 该盘用旧版登录插件；重跑 `install.ps1 -Target <盘根>\USB-Harness-with-runtime` |
| 工具不出现 | 确认 exe 与 `manifest.json` 同目录、exe 落在 `forensic\tools` 内；重启工作站 |
| 工具报 `PREFLIGHT_DENIED` | 工作区不可写或剩余空间 < 256 MiB |

更多见 `docs/使用说明.md`。

---

## 八、测试

```powershell
<盘根>\USB-Harness-with-runtime\.cache\runtimes\windows-x64\node\node.exe tests\run-all.mjs <盘根>\USB-Harness-with-runtime
```
覆盖策略守卫、登录鉴权、工具发现/校验/组装、执行前预检、发放分桶等。

---

## 九、许可

本项目（改装源）以 **MIT** 发布，见 [LICENSE](LICENSE)。
随仓库内置的第三方组件（osquery / Sleuth Kit / WinPmem）遵循各自许可，详见 [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md)。

> 基座 `USB-Harness-with-runtime` 及其依赖 DeepSeek Harness 属第三方，请遵循其自身许可后使用。
