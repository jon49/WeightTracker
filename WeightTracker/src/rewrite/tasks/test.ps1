
$i = 0
esbuild.cmd .\src\sw\sw.ts |
% {
    Write-Host $i
    Write-Host "$i : $_"
    $i++
}
