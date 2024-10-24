#!/usr/bin/env bash

current_dir="$(dirname $(readlink -f $0))"
config_filename="$current_dir/config.json"

/bin/cat <<EOM >$config_filename
{
    "appPath": "$current_dir/app",
    "port": 8008,
    "staticFiles": "$current_dir/public",
    "salt": "asdfasdf"
}
EOM

cd ../ImageBase/

v run . --config=$config_filename

