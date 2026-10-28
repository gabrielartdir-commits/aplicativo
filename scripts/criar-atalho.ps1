# Cria o atalho do BudgetOS na area de trabalho e no menu Iniciar.
#
# O atalho aponta para o BudgetOS.bat com a janela MINIMIZADA: o servidor
# precisa continuar rodando enquanto o app estiver aberto, mas nao precisa
# ocupar a tela. Fechar a janela (na barra de tarefas) desliga o servidor.
#
# Uso:
#   .\scripts\criar-atalho.ps1             area de trabalho + menu Iniciar
#   .\scripts\criar-atalho.ps1 -Remover    apaga os dois atalhos

[CmdletBinding()]
param([switch]$Remover)

$ErrorActionPreference = 'Stop'

$nome        = 'BudgetOS.lnk'
$projectRoot = Split-Path -Parent $PSScriptRoot
$alvo        = Join-Path $projectRoot 'BudgetOS.bat'
$icone       = Join-Path $projectRoot 'public\favicon.ico'

$destinos = @(
    (Join-Path ([Environment]::GetFolderPath('Desktop')) $nome),
    (Join-Path ([Environment]::GetFolderPath('StartMenu')) "Programs\$nome")
)

if ($Remover) {
    foreach ($d in $destinos) {
        if (Test-Path $d) { Remove-Item $d -Force; Write-Output "Removido: $d" }
    }
    exit 0
}

if (-not (Test-Path $alvo)) { throw "Nao encontrei $alvo" }

$shell = New-Object -ComObject WScript.Shell
foreach ($destino in $destinos) {
    $pasta = Split-Path -Parent $destino
    if (-not (Test-Path $pasta)) { New-Item -ItemType Directory -Path $pasta -Force | Out-Null }

    $link = $shell.CreateShortcut($destino)
    $link.TargetPath       = $alvo
    $link.WorkingDirectory = $projectRoot
    $link.Description      = 'BudgetOS - financas locais'
    $link.WindowStyle      = 7   # 7 = minimizada
    if (Test-Path $icone) { $link.IconLocation = $icone }
    $link.Save()

    Write-Output "Atalho criado: $destino"
}

Write-Output ''
Write-Output 'Para fixar na barra de tarefas: clique com o botao direito no atalho'
Write-Output 'da area de trabalho e escolha "Fixar na barra de tarefas".'
