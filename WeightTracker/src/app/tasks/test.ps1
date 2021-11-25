param([string[]]$test)

$test | % {
    Write-Host $_
}
