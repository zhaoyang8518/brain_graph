#!/usr/bin/env python3
import argparse
import sys

from markitdown import MarkItDown


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert a document to Markdown with MarkItDown.")
    parser.add_argument("path", help="Document path to convert")
    parser.add_argument("--max-chars", type=int, default=200_000, help="Maximum characters to print")
    args = parser.parse_args()

    try:
        result = MarkItDown().convert(args.path)
    except Exception as exc:
        print(f"MarkItDown conversion failed: {exc}", file=sys.stderr)
        return 1

    text = result.text_content or ""
    if args.max_chars > 0:
        text = text[: args.max_chars]
    sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
