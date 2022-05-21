# Start-Job -ScriptBlock { esbuild .\src\web\sw.ts --format=iife --bundle --outfile=./public/web/sw.js --watch }

param([switch]$Debug = $false, [switch]$FullStack = $false)

if ($Debug) {
    esbuild .\src\web\sw.ts --format=iife --bundle --outfile=.\public\web\sw.js --watch
    return
}

if ($FullStack) {
    esbuild .\src\web\sw.ts --format=iife --bundle --outfile=..\wwwroot\web\sw.js --watch
    return
}

Write-Host "Please select 'Debug' or 'FullStack'"
