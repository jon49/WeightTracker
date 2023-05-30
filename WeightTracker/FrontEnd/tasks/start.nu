#!/usr/bin/env nu

source ./get-files.nu
source ./set-cache-files.nu

rm -r -f out

ls src/**/*
| where name =~ '\.(html|css)$'
| insert target { |x|
    $x.name
    | str replace 'src/' 'out/'
}
| par-each { |x|
    if (not ($x.target | path dirname | path exists)) {
        mkdir ($x.target | path dirname)
    }
    cp $x.name $x.target
} | ignore

let all = (
    getPages | from nuon | get name
    | append (getJs | from nuon | get name)
    | append (getApis | from nuon | get name)
    | append ('[[name];[src/web/sw.ts]]' | from nuon | get name))

let e = ($all | append [
    '--bundle',
    '--outdir=out',
    '--outbase=src',
    '--format=esm',
    '--watch',
    '--tree-shaking=false'
])

# ^npx esbuild $e

# ^npx esbuild [
#     '--servedir=out',
#     '--serve=9000'
# ]

exec npx esbuild $e

