#!/usr/bin/env nu

def main [build: bool = false] {

    let targetDir = "out"

    rm -r -f $targetDir

    let insertHash = { |x|
        let splitFilename = ($x.name | split column '.' | transpose | get column1) 
        let flength = ($splitFilename | length)
        let filename = ($splitFilename | insert ($flength - 1) $x.hash | str join '.')
        $filename | str replace '^src/' $"($targetDir)/"
    }

    # webpack uses sha256 with 8 characters so I guess I will too!
    let addHash = { |x|
        $x
        | insert hash { |x| open $x.name | hash sha256 | str substring 56..64 }
        | insert hashed $insertHash
        | insert pathname { |x| $x.hashed | str substring ($x.hashed | str index-of '/')..999 }
        | insert target-dir { |x| $x.hashed | path dirname }
        | insert url { |x| $x.name | str substring ($x.name | str index-of '/')..999 }
        | select name hashed url pathname target-dir
    }

    # copy css files
    ls src/**/css/**/*.css
    | each $addHash
    | each { |x|
        mkdir $x.target-dir
        cp $x.name $x.hashed
    }

    let js = (
        ls **/src/**/js/**/*
        | where type == "file"
        | $in.name
    )

    let e = ($js | append [
        $"--outdir=($targetDir)",
        '--outbase=src',
        '--format=esm',
        '--tree-shaking=false',
        '--entry-names=[dir]/[name].[hash]',
    ]
    | append (
        if $build {
            [ '--minify' ]
        } else { [] }
    ))

    ^npx esbuild $e

    # write static files to entry-points file
    let files = (
        ls $"($targetDir)/**/*"
        | where { |x| $x.name =~ '\.(css|js)$' }
        | insert file { |x| $x.name | str substring ($x.name | str index-of '/')..999 }
        | insert url { |x|
            let s = $x.file
            let length = ($s | str length)
            let extension = ($s | str substring ($s | str index-of -e '.')..)
            let extensionLength = ($extension | str length)
            let first = ($s | str substring ..($length - $extensionLength - 9))
            $first + $extension
        }
        | select url file
        | to json
    )
    $"export default ($files)" | save -f src/web/entry-points.ts

    # copy html files
    cp src/index.html $"($targetDir)/index.html"

    let mainjs = (ls out/**/*main*.js | get name | first | str replace "out" "")
    open src/web/index.html
    | str replace '{{mainjs}}' $mainjs
    | save -f $"($targetDir)/web/index.html"

    # Service worker
    let sw = ([
        '--bundle',
        $"--outdir=($targetDir)",
        '--outbase=src',
        '--format=iife',
        'src/web/sw.ts',
    ]
    | append (
        if $build {
            ['--minify']
        } else { [
            $"--servedir=($targetDir)",
            '--watch'
        ] }
    ))

    ^npx esbuild $sw

}

