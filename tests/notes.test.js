// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let buildNotes;
beforeAll(async () => {
  const html = readFileSync(join(__dirname, "../index.html"), "utf8");
  document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, "");
  ({ buildNotes } = await import("../app.js"));
});

describe("buildNotes", () => {
  it("groups conventional commits and drops noise", () => {
    const log = [
      "a1b2c3d feat(api): add export endpoint",
      "b2c3d4e fix: crash on empty config",
      "c3d4e5f Merge pull request #12 from x/y",
      "d4e5f6a chore: bump deps",
      "e5f6a7b Bug fixes and performance improvements",
      "f6a7b8c refactor!: rename settings file",
    ].join("\n");
    const r = buildNotes(log, "v1.2.0");
    expect(r.markdown).toContain("## v1.2.0");
    expect(r.markdown).toMatch(/### Added\n\n- Api: add export endpoint\./);
    expect(r.markdown).toMatch(/### Fixed\n\n- Crash on empty config\./);
    expect(r.markdown).toMatch(/### Changed\n\n- Rename settings file\./);
    expect(r.markdown).toContain("### Skipped as generic");
    expect([r.kept, r.generic, r.noise]).toEqual([3, 1, 2]);
  });
  it("reads full git log output and Keep a Changelog lines", () => {
    const full = "commit abcdef1234\nAuthor: A <a@b>\nDate: now\n\n    Add dark mode\n\ncommit 1234567abc\nAuthor: A\n\n    Fixed login redirect\n";
    expect(buildNotes(full).markdown).toMatch(/Added\n\n- Dark mode\.[\s\S]*Fixed\n\n- Login redirect\./);
    expect(buildNotes("Security: patch token leak").markdown).toContain("### Security\n\n- Patch token leak.");
  });
  it("dedupes and says when nothing is left", () => {
    expect(buildNotes("fix: a thing\nfix: a thing").kept).toBe(1);
    expect(buildNotes("wip\nMerge branch main").markdown).toContain("Nothing specific enough");
  });
});

describe("ticket references", () => {
  it("files 'Fixes #N: ...' under Fixed", () => {
    for (const line of ["Fixes #12: crash on save", "fixes ABC-9 - crash on save", "(fixes #3) crash on save", "a1b2c3d Fixes #12: crash on save"]) {
      expect(buildNotes(line).markdown, line).toContain("### Fixed\n\n- Crash on save.");
    }
  });
  it("keeps plain ticket prefixes neutral", () => {
    expect(buildNotes("ABC-12: tidy settings page").markdown).toContain("### Changed\n\n- Tidy settings page.");
  });
});
