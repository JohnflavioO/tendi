import type { Config } from 'tailwindcss';
const config: Config = { content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'], theme: { extend: { colors: { ink: '#17211f', muted: '#718078', brand: '#167c67', canvas: '#f5f7f6' }, boxShadow: { panel: '0 8px 30px rgba(26, 43, 37, .06)' } } }, plugins: [] };
export default config;
