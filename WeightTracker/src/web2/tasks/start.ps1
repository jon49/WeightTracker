# Start-Job -ScriptBlock { esbuild .\src\web2\sw.ts --format=iife --bundle --outfile=./public/web2/sw.js --watch }

param([switch]$Debug = $false)

if ($Debug) {
    esbuild .\src\web2\sw.ts --format=iife --bundle --outfile=.\public\web2\sw.js --watch
} else {
    esbuild .\src\web2\sw.ts --format=iife --bundle --outfile=..\..\wwwroot\web2\sw.js --watch
}
