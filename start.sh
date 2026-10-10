#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  echo '首次启动：正在安装依赖（需要访问 npm registry）...'
  npm install --no-audit --no-fund
fi
npm run dev
