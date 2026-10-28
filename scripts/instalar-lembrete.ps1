# Registra (ou remove) a tarefa agendada do lembrete mensal.
#
# A tarefa roda TODO dia no horario escolhido e chama lembrete-mensal.ps1, que
# sai calado se hoje nao for o 5o dia util. Nao precisa de administrador: a
# tarefa e registrada no usuario atual.
#
# Uso:
#   .\scripts\instalar-lembrete.ps1              instala as 09:00
#   .\scripts\instalar-lembrete.ps1 -Hora 20:30  instala em outro horario
#   .\scripts\instalar-lembrete.ps1 -Remover     remove a tarefa

[CmdletBinding()]
param(
    [string]$Hora = '09:00',
    [switch]$Remover
)

$ErrorActionPreference = 'Stop'

$taskName = 'BudgetOS - Atualizacao mensal'
$script   = Join-Path $PSScriptRoot 'lembrete-mensal.ps1'

if ($Remover) {
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
        Write-Output "Tarefa removida: $taskName"
    } else {
        Write-Output 'A tarefa nao estava instalada.'
    }
    exit 0
}

if (-not (Test-Path $script)) { throw "Nao encontrei $script" }

try { $quando = [datetime]::ParseExact($Hora, 'HH:mm', $null) }
catch { throw "Horario invalido: '$Hora'. Use o formato HH:mm, por exemplo 09:00." }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""

$trigger = New-ScheduledTaskTrigger -Daily -At $quando

# StartWhenAvailable: se o computador estava desligado no horario, o aviso
# aparece quando ele ligar -- no 5o dia util isso importa.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Settings $settings -Description 'Avisa no 5o dia util para atualizar as financas no BudgetOS.' `
    -Force | Out-Null

Write-Output "Tarefa instalada: $taskName (todo dia as $Hora)"
Write-Output 'Para testar o aviso agora:'
Write-Output "  powershell -NoProfile -ExecutionPolicy Bypass -File `"$script`" -Force"
