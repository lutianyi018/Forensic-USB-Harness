# 第三方组件与许可

本仓库内置以下第三方二进制/组件。它们**不适用本项目的 MIT 许可**，各自遵循其自身许可证；
再分发时请保留其版权与许可声明。

## 随仓库内置的二进制

| 组件 | 版本 | 许可 | 来源 | 位置 |
|---|---|---|---|---|
| **osquery**（`osqueryi.exe`） | 5.23.1 | Apache-2.0 | https://github.com/osquery/osquery | `overlay/harness/forensic/tools/external/osquery/` |
| **Sleuth Kit**（`fls`/`icat`/`mmls`/`fsstat` 等 CLI） | 4.14.0 | CPL-1.0 + IBM Public License（部分工具另有许可） | https://github.com/sleuthkit/sleuthkit | `overlay/harness/forensic/tools/external/sleuthkit/bin/`，许可证随附于 `.../sleuthkit/licenses/` |
| **WinPmem**（`winpmem.exe`） | 4.0 | Apache-2.0 | https://github.com/Velocidex/WinPmem | `overlay/harness/forensic/tools/external/winpmem/` |

> Sleuth Kit 的 Windows 发行包内附 `licenses/`（`cpl1.0.txt`、`IBM-LICENSE`）已一并保留。
> 若你的使用场景需要最严格的合规，可自行改用其官方便携包替换 `bin/`。

## 仅提供清单（需自行获取，不随仓库分发）

| 组件 | 许可 | 获取 |
|---|---|---|
| **EZ Tools**（MFTECmd/EvtxECmd/PECmd/JLECmd） | MIT | https://ericzimmerman.github.io/ |

## 仅提供链接（许可不允许随仓库再分发）

| 组件 | 许可 | 链接 |
|---|---|---|
| Magnet DumpIt / RAM Capture | 专有免费软件（EULA 限制再分发） | https://www.magnetforensics.com/resources/ |
| Volatility 3 | Volatility Software License（限制再分发） | https://github.com/volatilityfoundation/volatility3 |
| Hindsight | Apache-2.0 | https://github.com/RyanDFIR/hindsight |
| BrowsingHistoryView (NirSoft) | NirSoft 免费ware（禁收费/禁商业集成/须原样） | https://www.nirsoft.net/utils/browsing_history_view.html |
| tgartifacts | MIT | https://github.com/Dmeetrogon/TGArtifacts |
| telegram-desktop-decrypt | MIT | https://github.com/atilaromero/telegram-desktop-decrypt |
| Telegram Desktop（官方“导出数据”） | GPLv3（含商标） | https://desktop.telegram.org/ |

## 基座

`USB-Harness-with-runtime` 及其依赖（DeepSeek Harness 及 npm 依赖）属第三方，**不在本仓库内**。
使用者需自行获取并遵循其许可。
