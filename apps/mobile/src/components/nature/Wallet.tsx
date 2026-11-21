import { walletPalette as c } from '@kaspilo/tokens';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

/** The owner's wallet.svg. `size` is the width. `shadow` draws the ground shadow. */
export function Wallet({ size = 200, shadow = true }: { size?: number; shadow?: boolean }) {
  return (
    <Svg width={size} height={(size * 230) / 220} viewBox="0 0 220 230">
      {shadow && <Ellipse cx={110} cy={219} rx={85} ry={9} fill="#000000" opacity={0.07} />}
      <Rect x={55} y={26} width={95} height={75} rx={11} fill={c.cardGreen} transform="rotate(-4 100 60)" />
      <Rect x={48} y={40} width={105} height={75} rx={11} fill={c.cardPeach} transform="rotate(2 100 75)" />
      <Rect x={60} y={54} width={34} height={6} rx={3} fill="#FFFFFF" opacity={0.55} transform="rotate(2 77 57)" />
      <Rect x={25} y={80} width={170} height={132} rx={20} fill={c.body} />
      <Path d="M25 100 a20 20 0 0 1 20 -20 H175 a20 20 0 0 1 20 20 V112 H25 Z" fill={c.flap} />
      <Path d="M33 118 H187" stroke={c.stitch} strokeWidth={2} strokeDasharray="5 5" opacity={0.6} />
      <Path
        d="M130 130 H182 a15 15 0 0 1 15 15 v26 a15 15 0 0 1 -15 15 H130 a28 28 0 0 1 -28 -28 a28 28 0 0 1 28 -28 Z"
        fill={c.clasp}
      />
      <Circle cx={160} cy={158} r={13} fill={c.coin} />
      <Circle cx={160} cy={158} r={5} fill={c.coinCenter} />
    </Svg>
  );
}
