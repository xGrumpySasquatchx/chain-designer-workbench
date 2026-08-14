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
- **Design pad** (right) — the molecule under design, drawn to BioGlyph's proportions. See below.
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

## Working the layout

- **Adjustable panels.** Every panel drags from its bottom edge to set its own height; double-clicking
  that edge returns it to fitting its contents. The two gutters between the columns drag sideways to
  rebalance the registry, bench and inspector widths, within limits that keep each column usable.
  Below three columns the layout decides the widths itself and the gutters retire.
- **Pop-out panels.** The ⤢ control in a panel header moves that panel into its own window, carrying
  the app's stylesheets with it, and the panel returns when the window closes. Where a host turns
  `window.open` into a tab that never renders — Electron shells and embedded IDE browsers do this —
  the panel detects that it would be invisible there and opens as a full-screen sheet instead.
- **Tooltips everywhere.** Controls explain themselves on hover or keyboard focus, in context: a
  disabled button says what is missing rather than just being grey, a part says how to place it, and
  the colour legend doubles as the glossary of part types.

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

### How it is drawn

The BioGlyph documentation describes the pad's behaviour but specifies no geometry or colour values,
so `src/model/dpad.ts` carries proportions measured from the published pad screenshots, expressed in
`u`, a sixth of a domain width. `npm run smoke` asserts them, so a later refactor cannot drift away
from the reference quietly.

- **One primitive.** Every immunoglobulin domain is the same rounded rectangle, `6u × 11u` with a
  corner radius of `0.5u`, and every block is a composition of it: a Fab is a two-by-two lattice, an
  scFv a single row, a VHH one box. Columns and rows are one box plus a `2u` gap.
- **The notch marks a variable domain.** VH, VL and VHH carry a slot `0.417 · W` wide and
  `0.237 · H` deep, filleted at the corner radius on all four corners; the two at the top edge are
  convex, which flares the mouth a radius wider on each side. Constant domains have no notch.
  Non-immunoglobulin blocks reuse the same box at `0.28 · W`, which reads as a lozenge.
- **Colour is the target, by slot.** The first target in a design is blue, the second green, the
  third magenta, and each block draws its two chains as a base shade and a lighter tint of the same
  hue. The Fc binds nothing, so it is grey — and the homodimer draws both columns in the same shade
  while the heterodimer draws a shade against a tint, which is what the symmetry rule looks like.
  Target chips over the canvas name the colours.
- **Geometry that carries meaning.** The two-chain Fabs get the orange interchain disulfide bar a
  unit above their bottom edge; the single-chain formats get the grey linker staple instead, running
  up the channel between the columns and into the notch. The Fc's double orange hinge sits between
  the two stems above CH2. Arms splay 28° off vertical with the N-terminus at the top, their stems
  turning vertical at an elbow before descending into the Fc, and the left arm is the mirror variant
  so the base column always faces in.
- **Flat dark canvas.** `#212121`, with no grid or dots — sampling an empty region of a reference
  screenshot returns that one colour and nothing else.

Three things are ours rather than BioGlyph's, because the reference does not show them: a domain
still waiting for a sequence is drawn outline-only (borrowing the outline mode BioGlyph uses for
unmatched blocks in Search by Structure), a domain supplied by the backbone is drawn at reduced
opacity, and the shared selection is a mint halo. An empty arm is a dashed drop target. The palette
also has no published rendering for xFab, Mutein, Mini-protein, De novo, Reagent or Tag — the
reference screenshots leave the palette scrolled — so those are composed from the same primitive:
the lozenge for the non-antibody blocks, and the Fab lattice with CL crossed onto the heavy chain for
the xFab.

## Construct map — Geneious Prime conventions

From [manual.geneious.com](https://manual.geneious.com/en/latest/) (Sequences, Annotations):

- **Directional annotations over a ruler.** Features are drawn as arrows in their strand direction
  with arrow tips, over coordinate ticks at a round interval.
- **Tracks stacked under the sequence.** Insert annotations sit on the sequence; backbone features
  form a track below it, named in the gutter the way Geneious names a track.
- **Circular by default, linear on demand.** A construct with a backbone opens circular and can be
  shown linearly without being converted, matching "linear view on circular sequences". A construct
  with no backbone is linear only, and the circular option is disabled rather than lying.
- **Several sequences are stacked.** Selecting more than one chain switches to a stacked linear
  comparison — names at the left, one shared coordinate scale, each sequence line ending at its own
  length. `Expand` opens the same stack full width.
- **Clicking an annotation selects its region**, and that selection is shared with the other viewers.

### How it is drawn

The manual describes behaviour, not geometry, so the drawing is measured from the published viewer
screenshots and kept in `src/model/mapview.ts`. Sizes are pixels at 1:1, as in Geneious, where bar
heights and fonts stay fixed while the sequence scales.

- **Annotation bar.** 15px tall, with a 2px drop shadow (`#B5B5B5` then `#DDDDDD`) and a 1px gap
  before the next row, so rows repeat every 18px. The directional end is a triangular point half the
  bar height, which puts both taper edges at 45°; the flat end is barely rounded, at 0.13× the height.
- **Fill.** A vertical three-stop gradient per feature: the brightest stop is about 1.21× the base
  value with the saturation pulled down, the base colour lands at 45% depth, and the bottom sits at
  about 0.78× the value. The 1px outline is a darker shade of the same hue, never grey.
- **Labels.** Inside the bar when they fit, in black or white by luminance; otherwise moved outside
  with a leader line, or dropped entirely rather than clipped, which is Geneious's "hide excessive
  labels". Names longer than the space available are shortened with an ellipsis.
- **Ruler.** No baseline — grey numbers with thousands separators and a 3px tick below each, at an
  interval of 1, 2 or 5 times a power of ten, chosen for the width available. `Expand` lengthens the
  axis rather than magnifying the drawing, so a wide map shows finer coordinates at the same type size.
- **Zoomed out.** The sequence collapses to a 2.5px grey line the annotations overlay, on a white
  canvas, with the name gutter in pale lavender and stacked constructs divided by a hairline.
- **Selection.** Everything outside the selected feature is dimmed to half alpha over white
  (`c' = 128 + c/2`), the boundaries get grey carets and bold blue coordinates that displace the round
  ones they would collide with, and a pale blue callout gives the selected length in bp.
- **Circular.** A 3px black backbone with the 15px annotation band centred on it, arrowheads bending
  with the curve to converge at the mid-radius, ruler labels outside running tangentially and flipped
  on the lower half, feature labels outside on leaders, and the construct name and length in the middle.
- **Colours.** Geneious stores annotation colour per type as a user preference. Where its screenshots
  show an unambiguous default we use it — CDS yellow, rep_origin azure, misc_feature grey — and
  elsewhere this app's part taxonomy stands in, so a domain keeps one colour across bench, pad and map.

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
                dpad.ts (measured pad geometry, domain outlines, target colour slots),
                geneious.ts (annotation and coordinate model for both map views),
                mapview.ts (measured map geometry, gradient shading, selection dimming)
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
