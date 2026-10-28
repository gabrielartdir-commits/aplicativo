# Lembrete do 5o dia util do mes.
#
# A tarefa agendada roda este script TODO dia. Ele sai calado em qualquer dia
# que nao seja o 5o dia util -- e mais simples e mais confiavel do que agendar
# uma data por mes, porque o 5o dia util muda conforme o calendario.
#
# Uso:
#   -Force   mostra o aviso mesmo que hoje nao seja o dia (para testar)
#   -Check   imprime o 5o dia util do mes e sai

[CmdletBinding()]
param(
    [switch]$Force,
    [switch]$Check
)

$ErrorActionPreference = 'Stop'

# Pascoa pelo algoritmo gregoriano anonimo -- de onde saem Carnaval,
# Sexta-feira Santa e Corpus Christi.
function Get-Easter([int]$Year) {
    $a = $Year % 19
    $b = [math]::Floor($Year / 100)
    $c = $Year % 100
    $d = [math]::Floor($b / 4)
    $e = $b % 4
    $f = [math]::Floor(($b + 8) / 25)
    $g = [math]::Floor(($b - $f + 1) / 3)
    $h = (19 * $a + $b - $d - $g + 15) % 30
    $i = [math]::Floor($c / 4)
    $k = $c % 4
    $l = (32 + 2 * $e + 2 * $i - $h - $k) % 7
    $m = [math]::Floor(($a + 11 * $h + 22 * $l) / 451)
    $month = [math]::Floor(($h + $l - 7 * $m + 114) / 31)
    $day = (($h + $l - 7 * $m + 114) % 31) + 1
    return Get-Date -Year $Year -Month $month -Day $day -Hour 0 -Minute 0 -Second 0
}

# Feriados nacionais + os municipais de Belo Horizonte.
function Get-Holidays([int]$Year) {
    $easter = Get-Easter $Year
    $dates = @(
        (Get-Date -Year $Year -Month 1  -Day 1),   # Confraternizacao
        $easter.AddDays(-48),                      # Carnaval (segunda)
        $easter.AddDays(-47),                      # Carnaval (terca)
        $easter.AddDays(-2),                       # Sexta-feira Santa
        (Get-Date -Year $Year -Month 4  -Day 21),  # Tiradentes
        (Get-Date -Year $Year -Month 5  -Day 1),   # Dia do Trabalho
        $easter.AddDays(60),                       # Corpus Christi
        (Get-Date -Year $Year -Month 8  -Day 15),  # Assuncao -- feriado em BH
        (Get-Date -Year $Year -Month 9  -Day 7),   # Independencia
        (Get-Date -Year $Year -Month 10 -Day 12),  # Aparecida
        (Get-Date -Year $Year -Month 11 -Day 2),   # Finados
        (Get-Date -Year $Year -Month 11 -Day 15),  # Proclamacao da Republica
        (Get-Date -Year $Year -Month 11 -Day 20),  # Consciencia Negra
        (Get-Date -Year $Year -Month 12 -Day 8),   # Conceicao -- feriado em BH
        (Get-Date -Year $Year -Month 12 -Day 25)   # Natal
    )
    return $dates | ForEach-Object { $_.Date }
}

function Get-NthBusinessDay([int]$Year, [int]$Month, [int]$N) {
    $holidays = Get-Holidays $Year
    $day = Get-Date -Year $Year -Month $Month -Day 1 -Hour 0 -Minute 0 -Second 0
    $count = 0
    while ($day.Month -eq $Month) {
        $isWeekend = $day.DayOfWeek -eq 'Saturday' -or $day.DayOfWeek -eq 'Sunday'
        if (-not $isWeekend -and $holidays -notcontains $day.Date) {
            $count++
            if ($count -eq $N) { return $day.Date }
        }
        $day = $day.AddDays(1)
    }
    return $null
}

$today  = (Get-Date).Date
$target = Get-NthBusinessDay $today.Year $today.Month 5

if ($Check) {
    Write-Output ("5o dia util de {0:MM/yyyy}: {1:dd/MM/yyyy} ({2})" -f $today, $target, $target.DayOfWeek)
    Write-Output ("Hoje: {0:dd/MM/yyyy} -- {1}" -f $today, $(if ($today -eq $target) { 'e o dia' } else { 'nao e o dia' }))
    exit 0
}

if (-not $Force -and $today -ne $target) { exit 0 }

# O .bat fica na raiz do projeto, um nivel acima de scripts/.
$projectRoot = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $projectRoot 'BudgetOS.bat'

Add-Type -AssemblyName System.Windows.Forms
$answer = [System.Windows.Forms.MessageBox]::Show(
    "Hoje e o 5o dia util de $('{0:MM/yyyy}' -f $today).`n`nHora de atualizar as financas do mes: lancar o que entrou e saiu, conferir as faturas e fechar o mes anterior.`n`nAbrir o BudgetOS agora?",
    'BudgetOS -- atualizacao mensal',
    [System.Windows.Forms.MessageBoxButtons]::YesNo,
    [System.Windows.Forms.MessageBoxIcon]::Information
)

if ($answer -eq [System.Windows.Forms.DialogResult]::Yes) {
    if (Test-Path $launcher) {
        Start-Process -FilePath $launcher -WorkingDirectory $projectRoot
    } else {
        [System.Windows.Forms.MessageBox]::Show(
            "Nao encontrei o BudgetOS.bat em:`n$launcher",
            'BudgetOS', 'OK', 'Warning') | Out-Null
    }
}
