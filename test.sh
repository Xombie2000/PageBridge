#!/bin/sh
set -eu

cd "$(dirname "$0")"
node --test Tests/JavaScript/*.test.js
if [ -d /Applications/Xcode.app/Contents/Developer ]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi
swift test --disable-sandbox
