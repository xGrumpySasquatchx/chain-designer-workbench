# MsAb construct designer

A multiple-insert cloning bench for multispecific antibody (MsAb) chain design. The handoff spec and
the standalone HTML prototype are ported into real React components, and the process flow diagram is
implemented as an actual state machine rather than a picture.

The two live views follow the conventions of the tools they stand in for: the design pad follows the
BioGlyph Design Pad ([docs.bioglyph.app](https://docs.bioglyph.app/)) and the construct map follows
Geneious Prime ([manual.geneious.com](https://manual.geneious.com/en/latest/)). Both are summarised
below with the specific rules they implement.

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # typecheck + production build
npm run smoke   # headless walk through the cloning loop
npm run lint
```

## What it does

- **Parts registry rail** (left) — searchable by name, feature and target, tabbed by Regions /
  Inserts / Vectors, filtered for compatibility against whatever the focused chain has already
  committed to. Nothing is selected by typing an ID. A **nucleotide / amino-acid toggle** decides
  which vocabulary is on screen: nucleotide lists everything in base pairs, amino acid lists only
  what exists as protein — promoters and terminators drop out — and sizes it in residues. One
  vocabulary at a time, never both.
- **Chain bench** (center) — one row per chain, with per-slot drop targets. Selection (click,
  shift-click range, cmd-click toggle), grouping, per-group ungroup, per-row eject, drag reordering,
  per-row and bulk annotation, and a three-level resolution control with per-row override and a
  hidden-combinatorics dot.
- **Design pad** (right) — the molecule under design, at building-block or domain zoom. See below.
- **Construct map** (right) — circular or linear for one construct, and a stacked linear comparison
  when several are selected. See below.
- **Cloning loop** (top) — the process diagram, live: one node is active for the focused chain and
  branches it did not take are dimmed.
- **QC and registration** — per-chain construct validation and whole-format validation across both
  arms. Failures block registration.
- **Combinatorics by stacking** — stacking a second option in a slot multiplies the design out.
  "Generate all" opens the variant gallery, and assembly mints one insert and construct per variant.
- **Linked panels** — one selection is shared by every view. Clicking a bench slot, a domain on the
  pad or an annotation on the map selects the same component in all three, and the rail marks the
  group it belongs to.

## Design pad — BioGlyph conventions

From [docs.bioglyph.app](https://docs.bioglyph.app/) (Design Pad, Quickstart):

- **Connection by proximity.** Building blocks are dragged from a curated palette — Fab, scFab, xFab,
  scFv, VHH, Mutein, Mini-protein, De novo, Reagent, Tag — and dropped onto an arm, where they fuse
  the way a genetic fusion reads.
- **Controlled connectivity.** Arm blocks occupy arm positions; a tag only fuses onto an existing
  block. This is enforced rather than drawn.
- **Shape is the building block, color is the sequence.** Shape encodes which block occupies the arm;
  color encodes the target the sequence binds. A `By part` toggle switches the pad back to the
  color taxonomy below when part category matters more than specificity.
- **Symmetry decides the Fc.** Symmetry is judged across the Y-axis through the Fc on both shape and
  color. A mirror image calls for a homodimeric Fc; anything asymmetric requires a heterodimer, and
  format QC checks that against the CH3 blocks actually chosen — a heterodimer needs a knob on one
  heavy chain and a hole on the other.
- **Format uniqueness.** Registering a format that already exists reuses its `FMT-id` rather than
  minting a new one; the signature is shape plus color across both arms, so a mirrored design is the
  same format whichever arm is drawn first.
- **The pad is functional, not decorative.** Choosing a block rewrites the bench: an scFv puts VH and
  VL on one chain, a VHH drops CH1 and the light chain, an xFab crosses CL onto the heavy chain.
  Blocks already chosen for slots that survive the change are kept.

## Construct map — Geneious Prime conventions

From [manual.geneious.com](https://manual.geneious.com/en/latest/) (Sequences, Annotations):

- **Directional annotations over a ruler.** Features are drawn as arrows in their strand direction
  with arrow tips, over coordinate ticks at a round interval.
- **Tracks stacked under the sequence.** Insert annotations sit on the sequence; backbone features
  form a track below it (inside it, in the circular view).
- **Circular by default, linear on demand.** A construct with a backbone opens circular and can be
  shown linearly without being converted, matching "linear view on circular sequences". A construct
  with no backbone is linear only, and the circular option is disabled rather than lying.
- **Several sequences are stacked.** Selecting more than one chain switches to a stacked linear
  comparison — names at the left, one shared coordinate scale, each sequence line ending at its own
  length. `Expand` opens the same stack full width.
- **Clicking an annotation selects its region**, and that selection is shared with the other viewers.

## Data model

| ID prefix | Meaning | Where it is minted |
|---|---|---|
| `BB-id` | Building block — a region-level sequence element | seeded registry |
| `INS-id` | Insert — building blocks assembled into one chain-coding sequence | on assemble |
| `VEC-id` | Vector / backbone, usually already carrying constant regions | seeded, or minted empty |
| `CC-id` | Construct — an insert combined with a vector | on assemble |
| `REG-id` | Registered chain — a construct checked into inventory | on register |
| `FMT-id` | Format — the molecule's shape and specificity across both arms | on register format |

A **chain design** is the bench-level working object: an ordered list of slots, each holding a stack
of candidate building blocks, plus a vector. Resolution never changes it — the full slot list always
exists underneath, and lowering the resolution only hides slots from the row.

Identical designs do not mint duplicate records: assembling a design whose insert composition and
vector already exist resolves to the existing `INS-id` and `CC-id`. Editing selections on an
assembled chain clears its construct so the next assembly mints a new `CC-id`, which is the "edit →
new CC-id" branch of the flow.

## Cloning loop

Implemented in `src/model/flow.ts`, one node per node of the process diagram:

1. **Select chain** from the worklist.
2. **Registered? (`REG-id`)** — a registered chain shows its registration and inventory instead of a
   design surface.
3. **Define chain components** from building blocks, or apply an existing insert wholesale.
4. **Construct exists? (`CC-id`)** — reuse it, or edit the selections for a new one.
5. **Vector backbone exists? (`VEC-id`)** — pick one, or mint an empty backbone.
6. **Assemble insert + vector** → new `CC-id` per variant.
7. **Validate (QC).** Pass registers; fail returns to assemble or edit.
8. **Register** → `REG-id`, and the loop moves to the next chain.

Every branch resolves to a next step — the diagram always has exactly one active node, and the
primary action in the QC panel is always the one thing that chain needs next. It is drawn as a
flowchart with fixed geometry: stadiums for the entry and exit, chamfered boxes for decisions, plain
boxes for actions, and orthogonal connectors whose branch labels sit in the corridors between rows.

## QC checks

**Per chain:** required components resolved (counting what the backbone supplies), backbone assigned,
chain lineage consistent, constant-region compatibility (isotypes must agree across parts and
backbone), no duplicated constant domains, coding sequence in frame, combinatorics resolved, plasmid
size in range.

**Per format:** both arm positions filled, symmetry verdict, CH3 pairing against that verdict
(heterodimer needs knob and hole; a symmetric format should not carry them), light-chain pairing
(a common light chain removes the mispairing problem), format registered, and the resulting
specificity.

Failures block registration; warnings are surfaced before the construct is minted rather than after.

## Color taxonomy

On the bench and the construct map, color encodes chain lineage rather than part category, so a fixed
universal light chain stays a stable pink presence while the heavy side varies: VH amber, hinge coral,
CH1/CH2/CH3 three shades of blue, VL and CL pink-family, promoter teal, terminator gray, linker
purple, payload rust, tag olive.

The design pad defaults to the BioGlyph convention instead — color is the target, so the two arms of
a bispecific read apart at a glance and a domain with no target stays neutral. `By part` switches it
to the taxonomy above.

## Project layout

```
src/model/      types, seeded registry, colors, combinatorics, QC, cloning-loop state machine,
                bioglyph.ts (building blocks, connectivity, symmetry, format identity),
                geneious.ts (annotation and coordinate model for both map views)
src/state/      reducer, contexts, provider — all session state lives here
src/components/ registry rail, bench rows and slots, design pad, construct map, flow diagram,
                QC panel, worklist, variant gallery, activity log
scripts/smoke.ts headless walk through the loop, run with `npm run smoke`
```

## Not yet built

- **Persistence.** Session state is in memory; a reload starts from the seeded registry. The
  bench-session vs. committed-record decision is still open.
- **Real registry API.** The registry is seeded in `src/model/registry.ts` behind the same shapes a
  service would return, so swapping in a client is a single-module change.
- **Real sequences.** Building blocks carry lengths, targets and features but no base sequence, so
  there is no residue-level zoom on the pad and no junction-level checking on the map.
- **Nested groups.** Grouping is one level deep, pending the group-nesting-depth decision.
- **More than two arms.** The pad scaffold is two arms and an Fc; appended arms and tandem fusions
  beyond a single tag per arm are not modelled.

## Open questions carried forward from the spec

1. Group nesting depth.
2. Eject repositioning — an ejected chain currently lands immediately above the group it left,
   not at its original position.
3. Bulk annotation writes identical text to every selected row.
4. Resolution as a saved preference vs. session state.
5. Whether the pad and map should also simplify at lower bench resolution. They currently stay at
   full detail, with their own independent zoom and view controls.
6. Coloring a third chain family: BioGlyph target coloring answers this on the pad, but the bench
   taxonomy still covers only one heavy and one light family.
