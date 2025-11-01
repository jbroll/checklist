module.exports = {
  '*.{ts,tsx}': ['tsc-files --noEmit'],
  '*.{ts,tsx,js,jsx,json,css,md}': ['biome check --write'],
};
