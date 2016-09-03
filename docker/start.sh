#!/bin/bash

stop() {
    printf "Stopping...\n"
    /usr/bin/svc -x /etc/service/*
    exit
}

trap stop TERM INT

printf "Starting mongodb and PrairieLearn...\n"
/usr/bin/svscanboot
