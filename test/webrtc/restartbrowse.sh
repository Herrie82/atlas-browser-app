#!/bin/sh
luna-send -n 1 palm://com.palm.applicationManager/close '{"id":"org.webosports.app.atlas"}' >/dev/null 2>&1
sleep 2
stop atlas 2>/dev/null; sleep 2
pkill -9 -f WPEWebProcess 2>/dev/null; sleep 1
: > /media/ram/bs-atlas.log 2>/dev/null
start atlas >/dev/null 2>&1
i=0; while [ $i -lt 30 ]; do pgrep -f BrowserServer-atlas >/dev/null && break; sleep 1; i=$((i+1)); done
echo "BS=$(pgrep -f BrowserServer-atlas|head -1) after ${i}s"
sleep 3
luna-send -n 1 palm://com.palm.applicationManager/open '{"id":"org.webosports.app.atlas","params":{"target":"https://example.com"}}' >/dev/null 2>&1
i=0; while [ $i -lt 20 ]; do pgrep -f WPEWebProcess >/dev/null && break; sleep 1; i=$((i+1)); done
sleep 6
echo "WP=$(pgrep -f WPEWebProcess|head -1)"
echo "load markers:"
grep -aiE "Connected to client|didFinish|example|navig|load committed" /media/ram/bs-atlas.log 2>/dev/null | tail -4
echo "qspkd: $(ps -ef 2>/dev/null | grep '[q]spkd' | awk '{print $2}' | head -1)"
