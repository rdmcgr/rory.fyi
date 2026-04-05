#!/usr/bin/env python3
"""Convert a CSV file to a JSON array of objects."""

import argparse
import csv
import json
from pathlib import Path


def read_rows(csv_path: Path):
    encodings = ["utf-8-sig", "utf-8", "cp1252", "latin-1"]
    last_err = None
    for enc in encodings:
        try:
            with csv_path.open("r", encoding=enc, newline="") as f:
                reader = csv.DictReader(f)
                rows = []
                for row in reader:
                    # Normalize empty strings to None and strip whitespace
                    cleaned = {k: (v.strip() if isinstance(v, str) else v) for k, v in row.items()}
                    if all(v in ("", None) for v in cleaned.values()):
                        continue
                    rows.append(cleaned)
                return rows
        except UnicodeDecodeError as err:
            last_err = err
            continue
    raise last_err


def main():
    parser = argparse.ArgumentParser(description="Convert CSV to JSON.")
    parser.add_argument(
        "--input",
        default="/Users/rory/Documents/Personal Website/data/Bookshelf_12_16_2025.csv",
        help="Path to input CSV",
    )
    parser.add_argument(
        "--output",
        default="/Users/rory/Documents/Personal Website/data/books.json",
        help="Path to output JSON",
    )
    args = parser.parse_args()

    csv_path = Path(args.input)
    out_path = Path(args.output)

    rows = read_rows(csv_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with out_path.open("w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"Wrote {len(rows)} rows to {out_path}")


if __name__ == "__main__":
    main()
