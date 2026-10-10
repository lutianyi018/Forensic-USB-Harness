# =============================================================================
# prepare-stick.ps1 — 初始化盘上三区并锁定固证区
#
#   - 创建 固证区 / 案件区 / device 三个目录；
#   - 对 固证区 与 device 施加 NTFS「拒绝写入」ACL（读仍允许）；
#   - 写入盘标记 forensic-stick.json。
#
# 参数：
#   -StickRoot <路径>  盘根（默认取证包所在目录的上一级）
#   -Unlock            解除锁定（临时往固证区投放证据前使用）
#
# 说明：ACL 是内核级兜底；AI 侧的软性约束由 dsh-forensic-policy 的守卫承担。
#       对管理员/SYSTEM 可绕过，故两层并存、不单独依赖其一。
# =============================================================================
[CmdletBinding()]
param(
    [string]$StickRoot = '',
    [switch]$Unlock
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $StickRoot) {
    $StickRoot = Split-Path -Parent (Join-Path $PSScriptRoot '..\USB-Harness-with-runtime')
}
$StickRoot = (Resolve-Path $StickRoot).Path
$User = "$env:USERDOMAIN\$env:USERNAME"

Write-Host "盘根：$StickRoot" -ForegroundColor Cyan
Write-Host "账户：$User" -ForegroundColor Cyan

foreach ($d in @('固证区', '案件区', 'device')) {
    $path = Join-Path $StickRoot $d
    New-Item -ItemType Directory -Force -Path $path | Out-Null
    Write-Host "  [目录] $d"
}

$marker = Join-Path $StickRoot 'forensic-stick.json'
if (-not (Test-Path $marker)) {
    $obj = [ordered]@{
        product    = 'ForensicDSH'
        version    = '0.1.0'
        created_at = (Get-Date).ToString('s')
        zones      = @('固证区', '案件区', 'device')
    }
    [IO.File]::WriteAllText($marker, ($obj | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false)))
    Write-Host '  [标记] forensic-stick.json'
}

# 只锁固证区与 device（只读证据区、身份区）；案件区保持可写。
$locked = @('固证区', 'device')
foreach ($d in $locked) {
    $path = Join-Path $StickRoot $d
    if ($Unlock) {
        & icacls $path /remove:d $User | Out-Null
        Write-Host "  [解锁] $d（已移除拒绝写入）" -ForegroundColor Yellow
    } else {
        # 先移除本账户已有的「拒绝」项（含早期版本写入的通用 W），再写入精确的写/删拒绝位。
        # 这样重复执行幂等，也能**就地修复**用旧掩码锁过的盘。
        # 为何不用通用 W：通用 W = FILE_GENERIC_WRITE，其中含 SYNCHRONIZE；而 libuv/Node
        # 每次打开文件都要 SYNCHRONIZE，于是 DENY(W) 会让 Node 连 stat / 读取都失败
        # （EINVAL/EPERM），后果是启动时 forensic-core 的 mkdir 崩溃、AI 也读不了证据。
        # WD=写数据 AD=追加 WEA=写扩展属性 WA=写属性 DE=删除 DC=删除子项。
        & icacls $path /remove:d $User 2>&1 | Out-Null
        & icacls $path /deny "$($User):(OI)(CI)(WD,AD,WEA,WA,DE,DC)" | Out-Null
        Write-Host "  [上锁] $d（拒绝写入/删除，读允许）" -ForegroundColor Green
    }
}

Write-Host '完成。' -ForegroundColor Green
