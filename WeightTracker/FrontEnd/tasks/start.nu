#!/usr/bin/env nu

def 'clean-str' [ path ] {
    $"src/($path)"
}

let pages = (
    ls **/src/**/*.html.ts
    | where name !~ "^_"
    | $in.name
)

let js = (
    ls **/src/**/js/**/*
    | where type == "file" and name !~ "/lib/"
    | $in.name
)

let all = ($pages | append $js | append "src/web/sw.ts")

let e = ($all | append [
    '--bundle',
    '--outdir=out',
    '--outbase=src',
    '--format=esm',
    '--watch',
    '--tree-shaking=false',
    '--servedir=out',
])

exec npx esbuild $e

