#!/bin/sh
cd "$(dirname "$0")"
open http://127.0.0.1:8787
node backend/server.js
