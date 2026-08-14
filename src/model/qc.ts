import { bbDef, ch3Role, chainTarget, fcPairing, scaffoldFc, symmetry } from './bioglyph';
import { armsNeedingLight, lightChainMode, moleculeReadiness } from './molecule';
import { PART_LABELS, PART_LINEAGE } from './parts';
import {
  insertLengthBp,
  suppliedByVector,
  unresolvedSlots,
  variantCount,
} from './combinatorics';
import type { ChainDesign, FormatDesign, QcCheck, QcResult, Registry } from './types';

const HEAVY_ISOTYPES = ['IgG1', 'IgG4'];
const LIGHT_ISOTYPES = ['kappa', 'lambda'];

function worst(checks: QcCheck[]) {
  if (checks.some((c) => c.status === 'fail')) return 'fail' as const;
  if (checks.some((c) => c.status === 'warn')) return 'warn' as const;
  return 'pass' as const;
}

/**
 * Format-level QC across both arms. The BioGlyph rule — symmetric formats take a
 * homodimeric Fc, asymmetric ones need a heterodimer — is checked against the
 * CH3 blocks actually chosen, since a heterodimer is built from knob and hole.
 */
export function runFormatQc(
  format: FormatDesign,
  chains: Record<string, ChainDesign>,
  registry: Registry,
): QcResult {
  const checks: QcCheck[] = [];
  const verdict = symmetry(format, chains, registry);
  const left = format.arms.left;
  const right = format.arms.right;
  const dimer = scaffoldFc(format, chains, registry);

  checks.push({
    id: 'arms',
    label: 'Both arm positions filled',
    status: left.bb === 'empty' || right.bb === 'empty' ? 'warn' : 'pass',
    detail: `${bbDef(left.bb).label} × ${bbDef(right.bb).label}`,
  });

  checks.push({
    id: 'fc-bb',
    label:
      format.fc === 'none'
        ? 'Fc building block'
        : format.fc === 'homofc'
          ? 'Homo-Fc on the scaffold'
          : 'Hetero-Fc on the scaffold',
    status: format.fc === 'none' ? 'warn' : 'pass',
    detail:
      format.fc === 'none'
        ? `${verdict.detail} Drag a Homo-Fc or Hetero-Fc onto the scaffold to choose.`
        : `${bbDef(format.fc).label} placed. ${verdict.detail}`,
  });

  checks.push({
    id: 'symmetry',
    label: verdict.symmetric ? 'Symmetric — homodimeric Fc' : 'Asymmetric — heterodimeric Fc',
    status:
      format.fc !== 'none' && fcPairing(format.fc) !== verdict.fc && verdict.fc !== 'none'
        ? 'warn'
        : 'pass',
    detail:
      format.fc !== 'none' && fcPairing(format.fc) !== verdict.fc && verdict.fc !== 'none'
        ? `Arms call for a ${verdict.fc}; ${bbDef(format.fc).label} is on the scaffold.`
        : verdict.detail,
  });

  const roleOf = (chainId: string | null) => {
    const chain = chainId ? chains[chainId] : undefined;
    const slot = chain?.slots.find((s) => s.type === 'ch3');
    return ch3Role(slot?.blockIds[0] ? registry.blocks[slot.blockIds[0]] : undefined);
  };
  const leftRole = roleOf(left.heavyChainId);
  const rightRole = roleOf(right.heavyChainId);

  if (dimer === 'heterodimer') {
    const paired =
      (leftRole === 'knob' && rightRole === 'hole') || (leftRole === 'hole' && rightRole === 'knob');
    checks.push({
      id: 'knob-hole',
      label: 'Heterodimer CH3 pairing',
      status: paired ? 'pass' : leftRole && rightRole ? 'fail' : 'warn',
      detail: paired
        ? `${leftRole} on the left arm, ${rightRole} on the right`
        : `An asymmetric format needs a knob on one heavy chain and a hole on the other; currently ${leftRole ?? 'unset'} and ${rightRole ?? 'unset'}.`,
    });
  } else if (dimer === 'homodimer' && left.bb !== 'empty') {
    const engineered = leftRole === 'knob' || leftRole === 'hole';
    checks.push({
      id: 'knob-hole',
      label: 'Homodimer CH3 pairing',
      status: engineered ? 'warn' : 'pass',
      detail: engineered
        ? 'A symmetric format does not need knob-into-hole CH3 variants.'
        : 'Wild-type CH3 on both heavy chains.',
    });
  }

  // The light chain decision, reported rather than assumed: an arm that needs one
  // and has none is unfinished, a shared one removes mispairing, and one per arm
  // is a legitimate choice that leaves mispairing to solve another way.
  const needLight = armsNeedingLight(format);
  if (needLight.length) {
    const mode = lightChainMode(format);
    const named = (id: string | null) => (id ? (chains[id]?.name ?? id) : 'none');
    checks.push({
      id: 'light-pairing',
      label: 'Light chain',
      status: mode === 'unset' ? 'warn' : mode === 'common' ? 'pass' : 'warn',
      detail:
        mode === 'unset'
          ? `${needLight.map((a) => `the ${a} arm`).join(' and ')} need a light chain: choose a common one for both arms, or one each.`
          : mode === 'common'
            ? `Common light chain on both arms (${named(left.lightChainId)}), so there is no light-chain mispairing to resolve.`
            : `One light chain per arm (${named(left.lightChainId)} and ${named(right.lightChainId)}); two different light chains can mispair unless the Fab interfaces are made orthogonal.`,
    });
  }

  checks.push({
    id: 'format-id',
    label: 'Format registered',
    status: format.formatId ? 'pass' : 'warn',
    detail: format.formatId
      ? `${format.formatId} — ${registry.formats[format.formatId]?.name ?? ''}`
      : 'This format has no identifier yet. Registering reuses an existing ID if the format already exists.',
  });

  const readiness = moleculeReadiness(format, chains);
  const molecule = format.moleculeId ? registry.molecules[format.moleculeId] : undefined;
  checks.push({
    id: 'molecule',
    label: 'Molecule registered',
    status: molecule ? 'pass' : 'warn',
    detail: molecule
      ? `${molecule.id} — ${molecule.name}, built from ${molecule.regIds.join(', ')}`
      : readiness.ready
        ? 'Every chain is registered, so this molecule can be registered and given a MOL-id.'
        : `Still to register: ${readiness.unregistered.map((c) => c.name).join(', ') || 'no chains on the arms yet'}.`,
  });

  const targets = [chainTarget(left.heavyChainId ? chains[left.heavyChainId] : undefined, registry),
    chainTarget(right.heavyChainId ? chains[right.heavyChainId] : undefined, registry)];
  checks.push({
    id: 'specificity',
    label: 'Specificity',
    status: targets.every(Boolean) ? 'pass' : 'warn',
    detail: targets.every(Boolean)
      ? targets[0] === targets[1]
        ? `Monospecific, bivalent for ${targets[0]}`
        : `Bispecific: ${targets[0]} × ${targets[1]}`
      : 'At least one arm has no variable domain or payload selected yet.',
  });

  return { status: worst(checks), checks };
}

/**
 * Construct QC (flow step 6). Fails block registration; warnings do not, but
 * they surface before the construct is minted rather than after.
 */
export function runQc(chain: ChainDesign, registry: Registry): QcResult {
  const checks: QcCheck[] = [];
  const vector = chain.vectorId ? registry.vectors[chain.vectorId] : null;
  const supplied = suppliedByVector(chain, registry);

  const missing = unresolvedSlots(chain, registry);
  checks.push({
    id: 'components',
    label: 'Required components resolved',
    status: missing.length ? 'fail' : 'pass',
    detail: missing.length
      ? `Unfilled: ${missing.map((s) => PART_LABELS[s.type]).join(', ')}`
      : 'Every insert-level slot is filled or supplied by the backbone.',
  });

  checks.push({
    id: 'backbone',
    label: 'Vector backbone assigned',
    status: vector ? 'pass' : 'fail',
    detail: vector
      ? `${vector.name} (${vector.id}), ${vector.lengthBp.toLocaleString()} bp, ${vector.resistance}`
      : 'No VEC-id selected for this chain.',
  });

  const lineageMismatch = chain.slots.filter((s) => {
    const lineage = PART_LINEAGE[s.type];
    return s.blockIds.some((id) => {
      const block = registry.blocks[id];
      return block && block.lineage !== lineage && block.lineage !== 'generic';
    });
  });
  checks.push({
    id: 'lineage',
    label: 'Chain lineage consistent',
    status: lineageMismatch.length ? 'fail' : 'pass',
    detail: lineageMismatch.length
      ? `Cross-lineage part in ${lineageMismatch.map((s) => PART_LABELS[s.type]).join(', ')}`
      : `All parts belong to the ${chain.kind} chain family.`,
  });

  // Constant-region compatibility: every isotype-bearing part must agree with
  // the others and with whatever the backbone already encodes.
  const declared = new Set<string>();
  chain.slots.forEach((s) =>
    s.blockIds.forEach((id) => {
      const iso = registry.blocks[id]?.isotype;
      if (iso) declared.add(iso);
    }),
  );
  if (vector?.isotype) declared.add(vector.isotype);
  const heavy = [...declared].filter((i) => HEAVY_ISOTYPES.includes(i));
  const light = [...declared].filter((i) => LIGHT_ISOTYPES.includes(i));
  const conflict = heavy.length > 1 || light.length > 1;
  checks.push({
    id: 'isotype',
    label: 'Constant-region compatibility',
    status: conflict ? 'fail' : declared.size ? 'pass' : 'warn',
    detail: conflict
      ? `Conflicting isotypes: ${[...heavy, ...light].join(' vs ')}`
      : declared.size
        ? `Consistent: ${[...declared].join(', ')}`
        : 'No isotype declared by any part or backbone yet.',
  });

  const redundant = chain.slots.filter(
    (s) => supplied.includes(s.type) && s.blockIds.length > 0,
  );
  checks.push({
    id: 'redundancy',
    label: 'No duplicated constant domains',
    status: redundant.length ? 'warn' : 'pass',
    detail: redundant.length
      ? `${redundant
          .map((s) => PART_LABELS[s.type])
          .join(', ')} set on the insert while also encoded in the backbone.`
      : 'Insert and backbone contribute distinct regions.',
  });

  const codingLength = chain.slots
    .filter((s) => s.type !== 'promoter' && s.type !== 'term')
    .reduce(
      (n, s) => n + (s.blockIds[0] ? (registry.blocks[s.blockIds[0]]?.lengthBp ?? 0) : 0),
      0,
    );
  // Nothing to code for is a failure, not a warning: a chain with an empty insert
  // would otherwise assemble and register, minting identifiers for nothing.
  checks.push({
    id: 'frame',
    label: 'Coding sequence in frame',
    status: codingLength === 0 ? 'fail' : codingLength % 3 === 0 ? 'pass' : 'fail',
    detail:
      codingLength === 0
        ? 'No coding regions selected yet, so this chain has nothing to express.'
        : `${codingLength.toLocaleString()} bp, ${codingLength % 3 === 0 ? 'divisible by 3' : `${codingLength % 3} bp out of frame`}`,
  });

  const variants = variantCount(chain);
  checks.push({
    id: 'combinatorics',
    label: 'Combinatorics resolved',
    status: variants > 1 ? 'warn' : 'pass',
    detail:
      variants > 1
        ? `${variants} variants stacked — registering mints ${variants} constructs.`
        : 'Single construct.',
  });

  const total =
    (vector?.lengthBp ?? 0) +
    insertLengthBp(
      Object.fromEntries(
        chain.slots.filter((s) => s.blockIds[0]).map((s) => [s.type, s.blockIds[0]]),
      ),
      registry,
    );
  checks.push({
    id: 'size',
    label: 'Plasmid size within range',
    status: total > 12000 ? 'warn' : 'pass',
    detail: total ? `${total.toLocaleString()} bp total` : 'Nothing to size yet.',
  });

  return { status: worst(checks), checks };
}
