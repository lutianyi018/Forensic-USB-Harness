# =============================================================================
# New-Stick.ps1 — 从母盘发放一枚新盘（软件复制、身份不复制）
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File .\New-Stick.ps1 -Source X:\ -Target Y:\
#
# 行为：
#   1. 按桶克隆：复制软件与身份模板；不复制 device/**、config/forensic-auth.secret、
#      固证区、案件区、会话/存储/凭据/日志、profile 的 node_modules；
#   2. 写盘标记；
#   3. 为该盘发放一枚全新设备身份（ID 由母盘台账顺序分配）。
# =============================================================================
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Target,
    [string]$Node = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $Node) { $Node = Join-Path $PSScriptRoot '..\USB-Harness-with-runtime\.cache\runtimes\windows-x64\node\node.exe' }
if (-not (Test-Path $Node)) {
    $Node = Join-Path $Source 'USB-Harness-with-runtime\.cache\runtimes\windows-x64\node\node.exe'
}
if (-not (Test-Path $Node)) { throw "找不到便携 Node，请用 -Node 指定。" }

$Cli = Join-Path $PSScriptRoot 'tools\provision.mjs'
& $Node $Cli new-device --source $Source --target $Target
if ($LASTEXITCODE -ne 0) { throw "发放失败（退出码 $LASTEXITCODE）" }

& $Node $Cli validate --target $Target --expect-identity
if ($LASTEXITCODE -ne 0) { throw "校验失败（退出码 $LASTEXITCODE）" }

# 重建 profiles\node_modules 链接：复制不会带上「绝对路径 Junction」，
# 需在新盘上按当地盘符重建（否则启动报 plugin tree failed to load）。
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Repair-Stick.ps1') -StickRoot $Target
if ($LASTEXITCODE -ne 0) { throw "模块链接重建失败（退出码 $LASTEXITCODE）" }
