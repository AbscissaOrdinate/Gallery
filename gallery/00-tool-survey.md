# Gallery — Tool Survey and Gap Analysis (2026-09-05)
 
## Requirements (from Sean)
1. **Structured notes / papercraft** — replaces Dynalist, Obsidian, Apple Notes, Docs/Sheets. Tagging, per-type schemas (`.ship`, `.module`, polity, location, character), cross-references (a `.ship` references `.module`s). Desktop + mobile quick capture.
2. **Maps, three scales** — orbital (2D contour: orbits, bodies, assets in orbit, Lagrange points), planetary (low-res globe + Mollweide, draw continents/seas/territories, call-outs), site (stations, buildings, small towns). Territories link to a wiki page backed by the JSON.
3. **Game-inspired design layer** — component designer (PD, missiles, drives, radiators…) under tunable constraints; components placed on ships/stations/strike craft; reusable low-res polygonal ship silhouettes (minimal CAD).
## Existing material reviewed
- Dynalist OPML: *Astro Polities*, *Fleets and Strikecraft*, *Trojan Timeline*. Deep hierarchical outlines; ship classes (e.g. Sword-of-State-class railgun destroyer) with armament, drive (NSWR), radiators, naming lists as nested bullets — i.e. already semi-structured, easy to migrate to typed records.
- *Sci-Fi Worlds Heliaris.docx* (~1,200 paragraphs): locations, language, politics, megastructures.
- *Heliaris Solar System.png*: hand-drawn Google Drawing — concentric orbits, orbital ring, skyhooks, stations at labelled points. Exactly the "orbital contour map" style wanted.
## Candidates
 
| Tool | Cost | Pillar 1 (structured notes) | Pillar 2 (maps) | Pillar 3 (ship/component design) | Mobile | Data ownership |
|---|---|---|---|---|---|---|
| **Obsidian** (+ Bases core plugin, Templater, Leaflet, Excalidraw) | Free; Sync optional (~$4–8/mo) or use OneDrive/iCloud | Strong. YAML frontmatter = per-type schema; Bases gives table/card/list/map views, formulas, filters, `this`-relations. Rows are files, not a real DB. | Partial. Leaflet = pinned image maps (+GeoJSON overlays, recalled); Excalidraw = freeform drawing. No orbits/L-points, no globe/Mollweide, no territory→page linkage beyond manual. | None | Yes (iOS/Android) | Local Markdown files — best in class |
| **Kanka** | Free (Kobold) unlimited entries; $4.99–24.99/mo | Good. ~20 entity types, custom **Properties** (can reference other properties), API, webhooks (paid). Open source / self-hostable. | Image maps with layers + markers; polygons unconfirmed. | None | Responsive web, no native app | Hosted (or self-host); export available |
| **LegendKeeper** | $7.50/mo (annual $90); free = view-only | Good UI, page templates + properties; no real database yet. | Best image maps (14K px, nested maps, pins); regions/polygons on roadmap. | None | **Not yet** (roadmap) | Hosted; export exists, format unspecified |
| **World Anvil** | Free tier; custom article templates need **Grandmaster** tier | Fixed article templates; custom templates cannot add new fields (layout/CSS only) | Image maps with pins/layers | None | Web | Hosted |
| **Notion / Anytype / AFFiNE** | Free personal tiers | Relational databases (Notion best; Anytype local-first with object types + relations) | Embeds only | None | Yes | Notion hosted; Anytype/AFFiNE local-first |
| **Starsy** (starsy.netlify.app) | Free | — | Linear/schematic star-system orbit maps, image export only | — | Web | Not a data model |
| **Azgaar FMG** | Free, open source | — | Fantasy planetary maps; exports GeoJSON/CSV; 3D globe view exists (recalled, unverified); no Mollweide | — | Web | Local `.map` file |
| **Children of a Dead Earth / NEBULOUS / Terra Invicta** | Games | — | — | The reference point for pillar 3; no exportable designer | — | — |
 
## Verdict
- **Nothing off-the-shelf covers pillar 3**, and nothing links an orbital/Lagrange map or a territory polygon to a typed record (pillar 2 integration). Those must be bespoke.
- **Pillar 1 is solvable today** with Obsidian: frontmatter-typed notes + Bases + templates + mobile. Kanka is the hosted alternative with a real API.
- Recommended architecture: **file-first hybrid.** One folder of typed records (Markdown+YAML or JSON; `.ship.json`-style) synced via OneDrive/iCloud/git. Obsidian reads it for notes/quick capture on phone; **bespoke web tools** (orbital map editor, planet map editor, component/ship designer, silhouette sketcher) read/write the same files. Nothing is locked in, every tool is replaceable.
- Fully bespoke (single PWA with its own storage) is viable too, but you lose Obsidian's mature mobile editor and pay the cost of rebuilding plain note-taking.
## Feature triage (draft)
- **Necessary:** typed records with schemas + references + tags; markdown body per record; mobile capture; orbital 2D editor with L-points; planet map w/ territories → record link; component/ship designer with computed mass/power/thermal/Δv and tunable constraint sets; sync across devices; export/backup.
- **Desired:** globe + Mollweide dual view; polygon silhouette editor with reuse; site-scale maps; timeline view; search across all types; Claude-assisted generation/validation of records.
- **Unneeded (for v1):** multi-user permissions, publishing/player views, tech trees, combat simulation, 3D rendering, real n-body physics.
## Open questions
1. Storage/sync: local files in OneDrive (Obsidian-compatible) vs hosted DB.
2. Keep Obsidian as the note/mobile layer, or go fully bespoke?
3. Ship designer fidelity: derived physics (mass budget, Δv, radiator area, power) vs freeform numbers.
4. Map fidelity: schematic (like the current drawing) vs true-scale/Keplerian with time.
## Sources
- https://kanka.io/pricing · https://kanka.io/features · https://char-gen.com/alternatives/world-anvil
- https://www.legendkeeper.com/features/ · https://prod.legendkeeper.com/pricing/
- https://www.worldanvil.com/learn/article-guides/custom-templates
- https://got.md/obsidian-bases/ · https://plugins.javalent.com/Leaflet
- https://starsy.netlify.app/ · https://github.com/Azgaar/Fantasy-Map-Generator/wiki/GIS-data-export
 
