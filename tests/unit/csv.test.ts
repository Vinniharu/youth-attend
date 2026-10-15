import { describe, expect, it } from "vitest";

import { csvCell, parseCsv, toCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("reads quoted fields, escaped quotes, commas and both line endings", () => {
    const text = '﻿name,email\r\n"Okafor, Chiamaka",c@x.org\n"Say ""hi""",s@x.org\n\n';
    expect(parseCsv(text)).toEqual([
      ["name", "email"],
      ["Okafor, Chiamaka", "c@x.org"],
      ['Say "hi"', "s@x.org"],
    ]);
  });

  it("keeps a final row without a newline and multi-line quoted cells", () => {
    expect(parseCsv('a,"line 1\nline 2"\nb,c')).toEqual([
      ["a", "line 1\nline 2"],
      ["b", "c"],
    ]);
  });
});

describe("csvCell / toCsv", () => {
  it("neutralises spreadsheet formulas", () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell("+234 800")).toBe("'+234 800");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@user")).toBe("'@user");
  });

  it("quotes only when needed and round-trips through the parser", () => {
    const rows = [
      ["name", "note"],
      ["Tobi", 'says "hi", often'],
      ["Ada", null],
    ];
    expect(parseCsv(toCsv(rows))).toEqual([
      ["name", "note"],
      ["Tobi", 'says "hi", often'],
      ["Ada", ""],
    ]);
  });
});
