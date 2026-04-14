import { useRef } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import type { ShaderMaterial } from "three"

// Vertex shader — displaces the plane mesh vertices using layered noise to create waves
const vertexShader = /* glsl */ `
  uniform float u_time;
  varying float vHeight;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0; float a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.1 + vec2(0.7, 1.3); a *= 0.5; }
    return v;
  }

  void main() {
    vec3 pos = position;
    float n = fbm(pos.xy * 0.55 + u_time * 0.22);
    pos.z += (n - 0.5) * 1.4;
    vHeight = pos.z;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

// Fragment shader — colors each vertex by its wave height, matching the original gradient palette
const fragmentShader = /* glsl */ `
  uniform float u_dark;
  varying float vHeight;

  void main() {
    float h = clamp((vHeight + 0.7) / 1.4, 0.0, 1.0);

    // Light palette: blue → violet → orange (mirrors original CSS gradient)
    vec3 l_lo = vec3(0.145, 0.388, 0.922); // #2563eb
    vec3 l_mi = vec3(0.486, 0.231, 0.933); // #7c3aed
    vec3 l_hi = vec3(0.976, 0.451, 0.086); // #f97316
    vec3 l_col = h < 0.5
      ? mix(l_lo, l_mi, h * 2.0)
      : mix(l_mi, l_hi, (h - 0.5) * 2.0);

    // Dark palette: navy → deep purple → burnt orange
    vec3 d_lo = vec3(0.118, 0.231, 0.541); // #1e3a8a
    vec3 d_mi = vec3(0.298, 0.110, 0.588); // #4c1d95
    vec3 d_hi = vec3(0.486, 0.176, 0.071); // #7c2d12
    vec3 d_col = h < 0.5
      ? mix(d_lo, d_mi, h * 2.0)
      : mix(d_mi, d_hi, (h - 0.5) * 2.0);

    vec3 color = mix(l_col, d_col, u_dark);
    gl_FragColor = vec4(color, 1.0);
  }
`

function WaveMesh({ isDark }: { isDark: boolean }) {
  const matRef = useRef<ShaderMaterial>(null!)

  useFrame(({ clock }) => {
    matRef.current.uniforms.u_time.value = clock.getElapsedTime()
    matRef.current.uniforms.u_dark.value = isDark ? 1.0 : 0.0
  })

  return (
    <>
      {/* Scene background matches the base color of each palette */}
      <color attach="background" args={[isDark ? "#1e3a8a" : "#2563eb"]} />
      <mesh rotation={[-0.55, 0, 0.15]}>
        {/* 80×80 segments give the noise enough resolution to look smooth */}
        <planeGeometry args={[10, 10, 80, 80]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={{
            u_time: { value: 0 },
            u_dark: { value: isDark ? 1.0 : 0.0 },
          }}
        />
      </mesh>
    </>
  )
}

export function WaveBackground({ isDark }: { isDark: boolean }) {
  return (
    <Canvas
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
      camera={{ position: [0, 2.2, 5], fov: 55 }}
      gl={{ antialias: true, powerPreference: "low-power" }}
      dpr={[1, 1.5]}
      frameloop="always"
    >
      <WaveMesh isDark={isDark} />
    </Canvas>
  )
}
