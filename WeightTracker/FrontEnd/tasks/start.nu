#!/usr/bin/env nu

source ./get-files.nu

rm -r -f out

mkdir "./out"

cp src/**/*.html ./out
cp src/**/*.css ./out

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
    '--tree-shaking=false',
])

exec npx esbuild $e

