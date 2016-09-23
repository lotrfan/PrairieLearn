#!/bin/bash

stop() {
    printf "Stopping...\n"
    /usr/bin/svc -x /etc/service/*
    exit
}

trap stop TERM INT

env | awk '/^PG|^PATH=/ { print "export " $0 }' > /.pgvars

printf "Starting PrairieLearn...\n"
if [[ -t 1 ]]; then
    JQ_COLOR="-C"
    colors='reset:"\u001b[0m", error:"\u001b[31m", warn:"\u001b[33m", info:"", verbose:"", debug:"", silly:""'
fi
(
    tail -F /pl/server.log 2>/dev/null | while read line; do
        jq -r '{'"$colors"'} as $colors | "\("" + $colors[.level]) \(.timestamp) \(.level)\($colors.reset) \(.message) "' <<< "$line" | head -c -1
        jq $JQ_COLOR 'del(.["timestamp", "level", "message"])' <<< "$line"
    done
) &

/usr/bin/svscanboot
