# =============================================================================
# New-Operator.ps1 — 制作方向取证盘写入一名操作员（姓名 + 身份证号 + 密码/PIN）
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File .\New-Operator.ps1 `
#       -Name 张三 -Id 110101199001011234 -Password 1234
#
# 说明：实际哈希由 tools\operator-cli.mjs 完成，确保与登录插件使用同一套算法。
#       身份证号与密码都只以「哈希」落盘，不写明文。
# =============================================================================
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Id,
    [Parameter(Mandatory = $true)][string]$Password,
    [string]$Role = 'investigator',
    [string]$OperatorId = '',
    [string]$StickRoot = '',
    [string]$Node = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$HarnessRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\USB-Harness-with-runtime')).Path
if (-not $StickRoot) { $StickRoot = Split-Path -Parent $HarnessRoot }
if (-not $Node) { $Node = Join-Path $HarnessRoot '.cache\runtimes\windows-x64\node\node.exe' }
if (-not (Test-Path $Node)) { throw "找不到便携 Node：$Node" }

$Cli = Join-Path $PSScriptRoot 'tools\operator-cli.mjs'
# 中文经命令行传给 node 会被终端代码页破坏，故用 UTF-8 JSON 文件中转。
$payload = @{ name = $Name; idCard = $Id; password = $Password; role = $Role }
if ($OperatorId) { $payload.operatorId = $OperatorId }
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("op-" + [Guid]::NewGuid().ToString("N") + ".json")
[IO.File]::WriteAllText($tmp, ($payload | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false)))

try {
    & $Node $Cli '--root' $StickRoot 'add' '--from-json' $tmp
    if ($LASTEXITCODE -ne 0) { throw "建号失败（退出码 $LASTEXITCODE）" }
} finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
}
