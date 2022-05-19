# Start-Job -ScriptBlock { esbuild .\src\web2\sw.ts --format=iife --bundle --outfile=./public/web2/sw.js --watch }

param([switch]$Debug = $false, [switch]$FullStack = $false)

if ($Debug) {
    esbuild .\src\web2\sw.ts --format=iife --bundle --outfile=.\public\web2\sw.js --watch
    return
}

if ($FullStack) {
    esbuild .\src\web2\sw.ts --format=iife --bundle --outfile=..\..\wwwroot\web2\sw.js --watch
    return
}

Write-Host "Please select 'Debug' or 'FullStack'"
