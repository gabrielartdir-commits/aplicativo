@echo off
REM Sobe o BudgetOS local e abre no navegador.
REM Feche esta janela para desligar o servidor.

cd /d "%~dp0"

echo.
echo   BudgetOS - servidor local
echo   ---------------------------------------------
echo   Seus dados: %~dp0data\budgetos.db
echo.

REM Compila quando nao ha build, ou quando o build esta contaminado.
REM
REM A pasta .next\static\development so existe depois de rodar "npm run dev":
REM o modo de desenvolvimento sobrescreve o manifesto de rotas e o "npm run
REM start" quebra com "routesManifest.dataRoutes is not iterable", mesmo com o
REM BUILD_ID no lugar. Nesse caso o .next inteiro e descartado.
set "PRECISA_BUILD="
if not exist ".next\BUILD_ID" set "PRECISA_BUILD=1"
if exist ".next\static\development" (
  echo   Build de desenvolvimento detectado - refazendo do zero...
  rmdir /s /q ".next"
  set "PRECISA_BUILD=1"
)

if defined PRECISA_BUILD (
  echo   Preparando a aplicacao, isso leva alguns instantes...
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
