# Quire

Quire is a content schema for fifth-edition tabletop roleplaying rules, in
both the 2014 and the 2024 versions, and an engine that works out a
character from content written in it. The rules are data: the engine knows
no class, spell, or item by name, and evaluates whatever content is loaded.
Published content and homebrew use the same bundle format, so a group puts
together the content it wants, and its own house rules work the same way
as anything printed.

This repository holds the schema, the engine, and the content of the two
System Reference Documents (SRD 5.1 and SRD 5.2.1) encoded in it. The target
for now is two interfaces, a character builder and sheet, and homebrew
authoring. Neither has a user interface yet.

| Path | Contents |
|---|---|
| `design/` | How the schema works; start at `design/README.md` |
| `packages/schema/` | The schema, authored in TypeBox; `generated/` has the JSON Schema and TypeScript types built from it |
| `packages/engine/` | The bundle loader, and working out a character |
| `packages/render/` | Renders mechanics as English rules text |
| `bundles/core/` | The shared vocabulary, and how rolls, activities, and states work |
| `bundles/srd/`, `bundles/srd24/` | The 2014 and 2024 SRD content |
| `vaults/` | The SRD text, the source each SRD bundle is checked against |

## Commands

Install with `pnpm install`, then:

- `pnpm check` runs every package's tests and loads the bundles.
- `node packages/engine/scripts/work-out.ts <character.json>` works out a
  saved character and prints its sheet.
- `node packages/engine/scripts/check-bundles.ts bundles/core bundles/srd24`
  loads the bundles named and reports what the loader found.
- `node packages/schema/scripts/validate.ts <files>` validates entity files.

A character names its bundles by code. The engine's scripts and tests find
them in `bundles/` in the working directory and then in this repository's
`bundles/`, or in the directories `QUIRE_BUNDLES` lists (separated as in
`PATH`). `QUIRE_CHARACTERS` points the sheet tests at other characters.

## License

The code is under the MIT License (`LICENSE`).

The content of `bundles/srd/` and `vaults/SRD/` is from the SRD 5.1, and the
content of `bundles/srd24/` and `vaults/SRD-2024/` is from the SRD 5.2.1.
`bundles/core/` quotes a few SRD 5.2.1 rules. That content is under the
Creative Commons Attribution 4.0 International License
(https://creativecommons.org/licenses/by/4.0/legalcode):

> This work includes material taken from the System Reference Document 5.1
> ("SRD 5.1") by Wizards of the Coast LLC and available at
> https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is
> licensed under the Creative Commons Attribution 4.0 International License
> available at https://creativecommons.org/licenses/by/4.0/legalcode.

> This work includes material from the System Reference Document 5.2.1
> ("SRD 5.2.1") by Wizards of the Coast LLC, available at
> https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative
> Commons Attribution 4.0 International License, available at
> https://creativecommons.org/licenses/by/4.0/legalcode.

Quire is not affiliated with or endorsed by Wizards of the Coast.
