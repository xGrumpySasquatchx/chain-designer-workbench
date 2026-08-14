import { bbDef, chainTarget, formatSignature, scaffoldFc } from './bioglyph';
import type {
  ArmId,
  ChainDesign,
  FormatDesign,
  LightChainMode,
  Registry,
} from './types';

/**
 * The molecule level of the loop. Building blocks, inserts, constructs and
 * chains all mint their own identifiers; the molecule those chains add up to is
 * the last thing that gets made, so it mints one too (MOL-id).
 */

const ARMS: ArmId[] = ['left', 'right'];

/** Arms whose building block needs a light chain of its own. */
export function armsNeedingLight(format: FormatDesign): ArmId[] {
  return ARMS.filter((arm) => bbDef(format.arms[arm].bb).needsLightChain);
}

/**
 * Whether the arms share one light chain, carry one each, or have not been given
 * one yet. A common light chain removes the mispairing problem, so it is worth
 * choosing deliberately — but it is a choice, and some designs want two.
 */
export function lightChainMode(format: FormatDesign): LightChainMode {
  const needed = armsNeedingLight(format);
  const ids = needed.map((arm) => format.arms[arm].lightChainId);
  if (!ids.length || ids.some((id) => !id)) return 'unset';
  return new Set(ids).size === 1 ? 'common' : 'per-arm';
}

/** Every chain the molecule is built from, heavy sides first, without repeats. */
export function moleculeChainIds(format: FormatDesign): string[] {
  const ids: string[] = [];
  ARMS.forEach((arm) => {
    const design = format.arms[arm];
    if (design.bb === 'empty') return;
    if (design.heavyChainId) ids.push(design.heavyChainId);
  });
  armsNeedingLight(format).forEach((arm) => {
    const id = format.arms[arm].lightChainId;
    if (id) ids.push(id);
  });
  return [...new Set(ids)];
}

export interface MoleculeReadiness {
  /** Chains that still have no REG-id, so the molecule cannot be registered. */
  unregistered: ChainDesign[];
  /** One REG-id per chain, in arm order, once every chain is registered. */
  regIds: string[];
  ready: boolean;
}

export function moleculeReadiness(
  format: FormatDesign,
  chains: Record<string, ChainDesign>,
): MoleculeReadiness {
  const used = moleculeChainIds(format).map((id) => chains[id]).filter(Boolean);
  const unregistered = used.filter((c) => !c.regIds.length);
  const regIds = used.flatMap((c) => c.regIds);
  return { unregistered, regIds, ready: used.length > 0 && unregistered.length === 0 };
}

/**
 * A molecule is the same molecule when it is the same format built from the same
 * registered chains, so registering it twice reuses the first identifier.
 */
export function moleculeSignature(
  format: FormatDesign,
  chains: Record<string, ChainDesign>,
  registry: Registry,
): string {
  const { regIds } = moleculeReadiness(format, chains);
  return `${formatSignature(format, chains, registry)}::${[...regIds].sort().join('+')}`;
}

export function moleculeTargets(
  format: FormatDesign,
  chains: Record<string, ChainDesign>,
  registry: Registry,
): string[] {
  return ARMS.map((arm) => {
    const id = format.arms[arm].heavyChainId;
    return chainTarget(id ? chains[id] : undefined, registry);
  }).filter((t): t is string => !!t);
}

/**
 * Named the way a project would refer to it: what it binds, then how many
 * specificities, then the shape it was built in.
 */
export function moleculeName(
  format: FormatDesign,
  chains: Record<string, ChainDesign>,
  registry: Registry,
): string {
  const targets = moleculeTargets(format, chains, registry);
  const unique = [...new Set(targets)];
  const binding = unique.length ? unique.join(' × ') : 'no target';
  const specificity =
    unique.length > 1 ? 'bispecific' : targets.length > 1 ? 'bivalent monospecific' : 'monovalent';
  const shape = ARMS.map((arm) => bbDef(format.arms[arm].bb).label).join('/');
  return `${binding} ${specificity} · ${shape}`;
}

export function moleculeFc(
  format: FormatDesign,
  chains: Record<string, ChainDesign>,
  registry: Registry,
) {
  return scaffoldFc(format, chains, registry);
}
