// Trade goods, ores, and tier definitions modeled on Limit Theory's Item / Material lists.
// Each item has a basePrice and volatility; markets adjust prices based on station
// supply/demand so trading routes naturally emerge.

export const Items = {
  // Raw ores (tier 1) — found in asteroids
  Iron:      { id: 'Iron',      label: 'Iron Ore',   tier: 1, base: 22,  vol: 0.18, color: '#a48c75' },
  Silica:    { id: 'Silica',    label: 'Silica',     tier: 1, base: 18,  vol: 0.20, color: '#d3c8b5' },
  Copper:    { id: 'Copper',    label: 'Copper Ore', tier: 1, base: 28,  vol: 0.22, color: '#d97a4a' },
  Titanium:  { id: 'Titanium',  label: 'Titanium',   tier: 1, base: 60,  vol: 0.25, color: '#b8c4cf' },
  Iridium:   { id: 'Iridium',   label: 'Iridium',    tier: 1, base: 110, vol: 0.30, color: '#e0e8f5' },

  // Refined goods (tier 2)
  Plates:    { id: 'Plates',    label: 'Hull Plates',     tier: 2, base: 90,  vol: 0.22, color: '#b8c4cf' },
  Circuits:  { id: 'Circuits',  label: 'Circuitry',       tier: 2, base: 180, vol: 0.30, color: '#6dffa0' },
  Coils:     { id: 'Coils',     label: 'Mag-coils',       tier: 2, base: 220, vol: 0.30, color: '#00e7ff' },
  Cells:     { id: 'Cells',     label: 'Power Cells',     tier: 2, base: 160, vol: 0.28, color: '#ffd23d' },

  // Luxury / high-value (tier 3)
  Quanta:    { id: 'Quanta',    label: 'Quantum Cores',   tier: 3, base: 720,  vol: 0.45, color: '#ff8a3d' },
  Datachip:  { id: 'Datachip',  label: 'Data-chips',      tier: 3, base: 580,  vol: 0.40, color: '#cfeaff' },
  Neutronium:{ id: 'Neutronium',label: 'Neutronium',      tier: 3, base: 1400, vol: 0.55, color: '#ff476a' }
};

export const ItemList = Object.values(Items);
export const Ores = ItemList.filter(i => i.tier === 1);

// A station's "production profile" decides what it consumes (demand) and outputs (supply).
// Mirrors LT's Production system at a much simpler level.
export const StationProductions = [
  { name: 'Refinery',   consumes: ['Iron', 'Silica'],   produces: ['Plates'] },
  { name: 'Foundry',    consumes: ['Copper', 'Iron'],   produces: ['Coils'] },
  { name: 'Fabricator', consumes: ['Titanium', 'Iridium'], produces: ['Circuits'] },
  { name: 'Powerworks', consumes: ['Iridium', 'Silica'], produces: ['Cells'] },
  { name: 'Datalab',    consumes: ['Circuits', 'Cells'], produces: ['Datachip'] },
  { name: 'Quantumyard',consumes: ['Coils', 'Plates'],   produces: ['Quanta'] },
  { name: 'Singularity',consumes: ['Quanta', 'Circuits'], produces: ['Neutronium'] },
];
