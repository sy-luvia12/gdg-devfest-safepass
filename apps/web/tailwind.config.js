/** @type {import('tailwindcss').Config} */
// 토큰은 DESIGN.md 9장 기준. 여기 값을 바꾸려면 DESIGN.md부터 고친다.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#FFFFFF',
        surface: { DEFAULT: '#F6F7F9', 2: '#EFF1F4' },
        line: '#ECEEF2',
        ink: { DEFAULT: '#1F2328', 2: '#6B7280', 3: '#A3A9B4' },
        // 파스텔 4색은 테마(학교 상징색·행사 디자인)에 따라 바뀐다 → src/index.css, src/app/theme.ts
        sky: 'rgb(var(--c-p1) / <alpha-value>)',
        lavender: 'rgb(var(--c-p2) / <alpha-value>)',
        pink: 'rgb(var(--c-p3) / <alpha-value>)',
        peach: 'rgb(var(--c-p4) / <alpha-value>)',
        mint: '#D3F1E2',
        success: { DEFAULT: '#22A06B', bg: '#E8F7EF' },
        danger: { DEFAULT: '#E5484D', bg: '#FDECEC' },
        warning: { DEFAULT: '#E59A1A', bg: '#FFF5E5' },
        link: '#3B82F6',
        // 운영진 콘솔 (/ops) 전용 검정 테마. 내부 데모·테스트 화면이라 DESIGN.md 흰 배경 규칙의 예외
        ops: {
          bg: '#0B0C10',
          panel: '#14161C',
          raised: '#1C1F27',
          line: '#2A2E38',
          ink: { DEFAULT: '#ECEEF2', 2: '#9AA1AD', 3: '#5F6672' },
          accent: '#A99BFF',
          ok: '#3DD68C',
          bad: '#FF6B6B',
          warn: '#F5B94A',
        },
      },
      fontFamily: { sans: ['Pretendard', 'system-ui', 'sans-serif'] },
      fontSize: {
        display: ['28px', { lineHeight: '36px', fontWeight: '600' }],
        title: ['22px', { lineHeight: '30px', fontWeight: '600' }],
        heading: ['17px', { lineHeight: '24px', fontWeight: '500' }],
        body: ['15px', { lineHeight: '22px', fontWeight: '400' }],
        label: ['13px', { lineHeight: '18px', fontWeight: '500' }],
        caption: ['12px', { lineHeight: '16px', fontWeight: '400' }],
        number: ['44px', { lineHeight: '48px', fontWeight: '600' }],
        'number-lg': ['64px', { lineHeight: '72px', fontWeight: '600' }],
      },
      maxWidth: { app: '480px', admin: '1200px' },
      borderRadius: { md: '14px', lg: '20px', xl: '28px' },
      boxShadow: {
        soft: '0 8px 24px rgba(31,35,40,0.06)',
        float: '0 12px 32px rgba(120,110,200,0.12)',
      },
      backgroundImage: {
        // 테마에 따라 바뀌는 것
        'grad-ticket': 'var(--grad-ticket)',
        'grad-button': 'var(--grad-button)',
        'grad-orb': 'var(--grad-orb)',
        // 상태 의미가 있는 것은 고정
        'grad-success': 'linear-gradient(160deg,#D3F1E2 0%,#CFE4FF 100%)',
        'grad-warm': 'linear-gradient(160deg,#FFE2C9 0%,#FAD3E4 100%)',
      },
      keyframes: {
        'sheet-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'rise-in': {
          from: { transform: 'translateY(8px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        breathe: { '0%,100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.03)' } },
        'row-flash': { from: { backgroundColor: 'rgba(220,215,255,0.2)' }, to: { backgroundColor: 'transparent' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: {
        'sheet-up': 'sheet-up 260ms cubic-bezier(0.2,0.8,0.2,1)',
        'rise-in': 'rise-in 200ms ease-out',
        breathe: 'breathe 6s ease-in-out infinite',
        'row-flash': 'row-flash 1s ease-out',
        'fade-in': 'fade-in 150ms ease-out',
      },
    },
  },
  plugins: [],
};
