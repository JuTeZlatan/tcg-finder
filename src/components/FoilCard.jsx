// Recto d'une carte en 3D avec sa finition brillante, calculée pixel par pixel (shader Skia) à partir de l'image même
// de la carte et de son orientation :
// - arc-en-ciel holographique qui balaie la surface quand on incline la carte (holo, foil) ;
// - motifs propres à chaque finition : nébuleuse (holo), paillettes (reverse), fines lignes (Secret Rare, ex, V…),
//   relief qui accroche la lumière en suivant le dessin (cartes texturées : illustrations rares, Enchantées, SP…),
//   or et argent métalliques, champ d'étoiles (galaxy), paillettes arc-en-ciel sur toute la carte (Starlight) ;
// - limitée à la zone brillante : l'illustration (holo), tout sauf l'illustration (reverse) ou toute la carte,
//   avec des bords fondus ;
// - reflet de lumière discret sur toutes les cartes.
// De face, presque rien ; inclinée, la lumière accroche la surface et glisse dessus, comme sur une vraie carte.
import { useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Fill, ImageShader, Shader, Skia, useImage } from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';

// Finitions (src/components/CardViewer3D.jsx → finishEffect) : n° du motif dans le shader.
export const FOIL_KINDS = { none: 0, holo: 1, cosmos: 2, reverse: 3, secret: 4, textured: 5, gold: 6, etched: 7, galaxy: 8, foil: 9, starlight: 10 };
// Zone brillante : 0 aucune, 1 illustration, 2 tout sauf l'illustration, 3 toute la carte.
export const FOIL_ZONES = { none: 0, art: 1, reverse: 2, full: 3 };

const SKSL = `
uniform shader card;
uniform float2 res;
uniform float2 tilt;   // inclinaison : sinus des angles (x : haut / bas, y : gauche / droite), -1 à 1
uniform float4 zone;   // fenêtre de l'illustration (fractions de la carte) : x, y, largeur, hauteur
uniform float mode;    // zone brillante (voir FOIL_ZONES)
uniform float kind;    // motif (voir FOIL_KINDS)

float hash(float2 p) { return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
float noise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + float2(1, 0)), u.x), mix(hash(i + float2(0, 1)), hash(i + float2(1, 1)), u.x), u.y);
}
float3 hue(float h) {
  float3 k = abs(fract(h + float3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0;
  return clamp(k, 0.0, 1.0);
}
float luma(float3 c) { return dot(c, float3(0.299, 0.587, 0.114)); }

half4 main(float2 p) {
  half4 src = card.eval(p);
  float3 base = float3(src.rgb);
  float2 uv = p / res;
  float t = clamp(length(tilt), 0.0, 1.0);

  // Zone brillante, bords fondus.
  float m = 0.0;
  if (mode > 0.5) {
    float2 a = zone.xy;
    float2 b = zone.xy + zone.zw;
    float f = 0.014;
    float inside = smoothstep(a.x - f, a.x + f, uv.x) * smoothstep(b.x + f, b.x - f, uv.x)
                 * smoothstep(a.y - f, a.y + f, uv.y) * smoothstep(b.y + f, b.y - f, uv.y);
    m = mode < 1.5 ? inside : (mode < 2.5 ? 1.0 - inside : 1.0);
  }

  // Bande de lumière qui traverse la carte à l'opposé de l'inclinaison (large et douce), et phase de l'arc-en-ciel.
  float2 dir = normalize(float2(0.78, 0.62));
  float d = dot(uv - 0.5, dir) + tilt.y * 0.75 - tilt.x * 0.55;
  float sweep = exp(-d * d * 9.0);
  float phase = dot(uv, float2(0.55, 0.85)) * 1.6 + tilt.y * 1.4 - tilt.x * 1.1;
  float lit = 0.25 + 0.75 * t; // presque rien de face, net une fois inclinée

  float3 add = float3(0.0);
  float3 col = base;
  float k = kind;
  if (k > 0.5 && m > 0.001) {
    float l = luma(base);
    if (k < 1.5) {
      // Holo : arc-en-ciel net dans la bande de lumière, plus visible sur les zones claires.
      add = hue(phase) * (0.10 + 0.55 * sweep) * (0.45 + 0.75 * l);
    } else if (k < 2.5) {
      // Nébuleuse (holo « cosmos ») : taches de couleur qui ondulent.
      float n = noise(uv * 7.0 + tilt * 2.0) * 0.7 + noise(uv * 23.0 - tilt * 3.0) * 0.3;
      add = hue(phase + n * 0.9) * (0.12 + 0.6 * sweep) * (0.4 + n) * (0.5 + 0.7 * l);
    } else if (k < 3.5) {
      // Reverse : paillettes qui s'allument selon l'angle, sur un léger voile arc-en-ciel.
      float2 cell = floor(p / 3.2);
      float r = hash(cell);
      float tw = pow(max(0.0, sin(r * 50.0 + tilt.x * 9.0 + tilt.y * 11.0)), 24.0) * step(0.55, r);
      add = hue(phase + r * 0.3) * (0.06 + 0.3 * sweep) + float3(tw) * (0.35 + 0.65 * sweep) * 0.9;
    } else if (k < 4.5) {
      // Secret Rare / ex / V : fines lignes diagonales prismatiques qui scintillent.
      float lines = pow(0.5 + 0.5 * sin(dot(p, float2(1.0, -1.0)) * 0.9), 6.0);
      float cross = pow(0.5 + 0.5 * sin(dot(p, float2(1.0, 1.0)) * 0.9), 6.0);
      float r = hash(floor(p / 2.5));
      float glint = pow(max(0.0, sin(r * 40.0 + tilt.x * 8.0 - tilt.y * 10.0)), 30.0);
      add = hue(phase * 1.4 + lines * 0.2) * (0.08 + 0.7 * sweep) * (0.35 + 0.9 * max(lines, cross * 0.6)) + float3(glint) * 0.5 * sweep;
    } else if (k < 5.5) {
      // Texturée : relief tiré du dessin de la carte ; la lumière accroche les reliefs, en arc-en-ciel.
      float e = 1.6;
      float gx = luma(float3(card.eval(p + float2(e, 0)).rgb)) - luma(float3(card.eval(p - float2(e, 0)).rgb));
      float gy = luma(float3(card.eval(p + float2(0, e)).rgb)) - luma(float3(card.eval(p - float2(0, e)).rgb));
      float3 n = normalize(float3(-gx * 5.0, -gy * 5.0, 1.0));
      float3 L = normalize(float3(tilt.y * 0.9, -tilt.x * 0.9, 0.55));
      float spec = pow(max(0.0, dot(n, L)), 6.0);
      float grain = 0.5 + 0.5 * sin(dot(p, float2(0.7, 0.4)) * 1.3 + noise(uv * 60.0) * 6.0);
      float fine = noise(p * 0.45) * 0.6 + noise(p * 0.12) * 0.4;
      add = hue(phase + gx * 3.0 + gy * 3.0 + fine * 0.35) * (0.16 + 0.8 * sweep) * (0.45 + 0.9 * spec) * (0.55 + 0.45 * grain) * (0.7 + 0.6 * fine)
          + float3(spec) * 0.22 * sweep;
    } else if (k < 6.5) {
      // Or : la carte prend une teinte or métallique, reflet chaud qui glisse.
      float3 gold = float3(1.0, 0.80, 0.36) * (0.45 + 0.75 * l);
      // Carte déjà dorée sur l'image (Hyper Rare, God Rare…) : on n'éclaircit pas davantage les zones claires.
      col = mix(base, gold * (0.75 + 0.5 * l), 0.18 * m);
      float grain = noise(uv * 90.0);
      add = float3(1.0, 0.88, 0.55) * sweep * (0.12 + 0.22 * grain) * (1.15 - l) + hue(phase) * 0.05 * sweep;
    } else if (k < 7.5) {
      // Argent gravé (etched, Ultimate) : métal brossé, relief discret.
      float brushed = noise(float2(uv.x * 4.0, uv.y * 220.0));
      float3 silver = float3(0.86, 0.88, 0.92) * (0.5 + 0.6 * l);
      col = mix(base, silver, 0.06 * m);
      add = (float3(0.95, 0.97, 1.0) * (0.10 + 0.35 * brushed) + hue(phase + brushed * 0.5) * 0.22) * sweep * (0.4 + 0.8 * l);
    } else if (k < 8.5) {
      // Galaxy : champ d'étoiles qui scintillent, voile arc-en-ciel.
      float2 cell = floor(p / 4.0);
      float r = hash(cell);
      float star = step(0.985, r) * (0.5 + 0.5 * sin(r * 80.0 + (tilt.x + tilt.y) * 12.0));
      add = hue(phase) * (0.06 + 0.3 * sweep) + float3(star) * 0.9;
    } else if (k < 9.5) {
      // Foil (Magic, Lorcana, One Piece, Dragon Ball…) : larges bandes arc-en-ciel douces sur toute la zone ; la carte
      // est un peu plus sombre et saturée, comme une impression sur métal.
      col = mix(base, base * base * 1.25, 0.25 * m);
      add = hue(phase * 0.8) * (0.08 + 0.42 * sweep) * (0.5 + 0.6 * l);
    } else {
      // Starlight : paillettes arc-en-ciel sur toute la carte, intenses.
      float2 cell = floor(p / 2.4);
      float r = hash(cell);
      float tw = pow(max(0.0, sin(r * 60.0 + tilt.x * 10.0 + tilt.y * 12.0)), 12.0);
      add = hue(phase + r) * (0.08 + 0.45 * sweep) + hue(r + phase) * tw * (0.4 + 0.6 * sweep);
    }
    add *= m * lit;
  }

  // Reflet de lumière (toutes les cartes, discret) : tache douce qui suit l'inclinaison.
  float2 g = float2(0.5 - tilt.y * 0.7, 0.42 + tilt.x * 0.7);
  float glare = exp(-dot(uv - g, uv - g) * 5.0) * (0.04 + 0.16 * t);
  float3 outc = col + add + float3(glare);
  return half4(half3(clamp(outc, 0.0, 1.0)) * src.a, src.a);
}
`;

const effect = Skia.RuntimeEffect.Make(SKSL);

// `tiltRef` : { x, y } mis à jour par la visionneuse (sinus des angles) ; `onTilt` reçoit une fonction (x, y) => void.
export default function FoilCard({ uri, width, height, kind = 'none', zone = 'none', art, onTilt, onLoad }) {
  const image = useImage(uri);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  useEffect(() => {
    onTilt?.((x, y) => {
      tx.value = x;
      ty.value = y;
    });
  }, [onTilt, tx, ty]);
  useEffect(() => {
    if (image) onLoad?.({ width: image.width(), height: image.height() });
  }, [image, onLoad]);
  const fixed = useMemo(() => ({
    res: [width, height],
    zone: art ? [art.x, art.y, art.w, art.h] : [0, 0, 1, 1],
    mode: FOIL_ZONES[zone] ?? 0,
    kind: FOIL_KINDS[kind] ?? 0,
  }), [width, height, art, zone, kind]);
  const uniforms = useDerivedValue(() => ({ ...fixed, tilt: [tx.value, ty.value] }), [fixed]);
  if (!effect || !image || !width || !height) return null;
  return (
    <Canvas style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      <Fill>
        <Shader source={effect} uniforms={uniforms}>
          <ImageShader image={image} fit="cover" rect={{ x: 0, y: 0, width, height }} />
        </Shader>
      </Fill>
    </Canvas>
  );
}
