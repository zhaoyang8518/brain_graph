#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [ -z "${PYTHON_BIN:-}" ]; then
  if command -v pyenv >/dev/null 2>&1 && pyenv which python3.12 >/dev/null 2>&1; then
    PYTHON_BIN="$(pyenv which python3.12)"
  else
    PYTHON_BIN="python3.12"
  fi
fi
VENV_DIR="$ROOT_DIR/.venv-markitdown"
TARGET_TRIPLE="${TARGET_TRIPLE:-aarch64-apple-darwin}"
SIDECAR_NAME="markitdown-sidecar"
OUTPUT_NAME="${SIDECAR_NAME}-${TARGET_TRIPLE}"
PIP_INDEX_URL="${PIP_INDEX_URL:-https://pypi.tuna.tsinghua.edu.cn/simple}"
PIP_CACHE_DIR="${PIP_CACHE_DIR:-$ROOT_DIR/sidecars/pip-cache}"

cd "$ROOT_DIR"

if [ ! -d "$VENV_DIR" ]; then
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

"$VENV_DIR/bin/python" -m pip install -U pip -i "$PIP_INDEX_URL" --cache-dir "$PIP_CACHE_DIR"
"$VENV_DIR/bin/python" -m pip install -U pyinstaller "markitdown[pdf,docx,pptx,xlsx,xls]" -i "$PIP_INDEX_URL" --cache-dir "$PIP_CACHE_DIR"

"$VENV_DIR/bin/pyinstaller" \
  --clean \
  --onefile \
  --collect-data magika \
  --collect-data markitdown \
  --name "$SIDECAR_NAME" \
  --distpath "$ROOT_DIR/sidecars/dist" \
  --workpath "$ROOT_DIR/sidecars/build" \
  "$ROOT_DIR/sidecars/markitdown_sidecar.py"

mkdir -p "$ROOT_DIR/src-tauri/binaries"
cp "$ROOT_DIR/sidecars/dist/$SIDECAR_NAME" "$ROOT_DIR/src-tauri/binaries/$OUTPUT_NAME"
chmod +x "$ROOT_DIR/src-tauri/binaries/$OUTPUT_NAME"

echo "Built $ROOT_DIR/src-tauri/binaries/$OUTPUT_NAME"
