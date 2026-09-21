import type { InventoryRecord } from './types';

/**
 * What is actually on the shelf, said the way someone standing at the freezer
 * would say it. A REG-id means a chain was registered; it does not mean there
 * is material left, so volume comes before anything else.
 */
export function stockLine(inventory: InventoryRecord | undefined): string {
  if (!inventory) return 'nothing in inventory';
  if (!inventory.volumeUl) return 'registered, none prepped yet';
  const parts = [
    `${inventory.volumeUl} µL at ${inventory.concentrationNgUl} ng/µL`,
    `${inventory.plasmidUg} µg`,
  ];
  if (inventory.glycerolStock) parts.push('glycerol stock');
  return parts.join(' · ');
}

/** Freezer, rack, box and the position in the box, when the tube has one. */
export function locationLine(inventory: InventoryRecord | undefined): string {
  if (!inventory) return '—';
  return inventory.position && inventory.position !== 'unassigned'
    ? `${inventory.location} / ${inventory.position}`
    : inventory.location;
}
