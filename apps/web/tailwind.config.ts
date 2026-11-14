import type { Config } from 'tailwindcss';

/**
 * Tokens de design do TendiDesk. `ink`, `muted`, `brand` e `canvas` seguem no site público;
 * a paleta `tendi` e as sombras/raios abaixo padronizam o painel do cliente e o Console.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#17211f', muted: '#718078', brand: '#167c67', canvas: '#f5f7f6',
        tendi: {
          night: '#14163A',   // fundo do menu lateral
          navy: '#1B1D4A',    // títulos
          deep: '#25275B',
          indigo: '#2F316B',
          lilac: '#7C7EC0',
          mist: '#EEEEF8',    // fundo de item ativo / realce suave
          haze: '#F6F7FB',    // fundo das páginas
          line: '#E6E8F1',    // bordas
          magenta: '#CB0A9F',
          blush: '#FCEAF7',
          teal: '#004751',
          tealsoft: '#E6F1F1',
        },
      },
      boxShadow: {
        panel: '0 8px 30px rgba(26, 43, 37, .06)',
        card: '0 1px 2px rgba(20, 22, 58, .04), 0 6px 20px -10px rgba(20, 22, 58, .10)',
        lift: '0 2px 4px rgba(20, 22, 58, .04), 0 18px 36px -16px rgba(20, 22, 58, .20)',
        pop: '0 12px 40px -8px rgba(20, 22, 58, .22), 0 2px 6px rgba(20, 22, 58, .06)',
        focus: '0 0 0 4px rgba(124, 126, 192, .22)',
      },
      borderRadius: { card: '18px' },
      transitionTimingFunction: { soft: 'cubic-bezier(.2, .8, .2, 1)' },
    },
  },
  plugins: [],
};
export default config;
