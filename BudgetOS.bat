@echo off
REM Sobe o BudgetOS local e abre no navegador.
REM Feche esta janela para desligar o servidor.

cd /d "%~dp0"

echo.
echo   BudgetOS - servidor local
echo   ---------------------------------------------
echo   Seus dados: %~dp0data\budgetos.db
echo.

REM Compila so quando o build ainda nao existe ou o codigo mudou.
if not exist ".next\BUILD_ID" (
  echo   Preparando a aplicacao pela primeira vez...
  call npm run build || goto :erro
)

echo   Iniciando em http://localhost:3000
echo   Feche esta janela para desligar.
echo.

start "" http://localhost:3000
call npm run start
goto :fim

:erro
echo.
echo   Falha ao preparar a aplicacao. Rode "npm install" nesta pasta.
pause

:fim
