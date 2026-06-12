/**
 * GLSL transcribed from github.com/deedy/glacial-valley (shaders.js) — the
 * user's explicit direction: copy that project's code. Changes are limited
 * to what CANNOT work here: the coarse far-field map (their static world has
 * two height regions; our vale has one), the screen-space refraction pass
 * (two-pass pipeline), the wagon-track/season scalars (fixed uniforms now),
 * and HDR scale (their sun is 10.5 under ACES; ours feeds the NEUTRAL
 * tonemap, so the uniform driver supplies ~2.5).
 */
export const REF_COMMON = /* glsl */ `
uniform float uTime;
uniform vec3  uSunDir;
uniform vec3  uSunColor;
uniform vec3  uSkyZenith;
uniform vec3  uHorizonCold;
uniform vec3  uHorizonWarm;
uniform vec3  uGroundBounce;
uniform sampler2D uMapFine;     // R: height, G: morning sun vis, B: evening sun vis
uniform vec3  uRegFine;         // center x, center z, half extent
uniform float uWaterY;
uniform vec2  uWindDir;
uniform vec2  uVisW;            // morning / evening shadow-map weights
uniform float uGreen;
uniform float uAutumn;

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  float a = hash12(i);
  float b = hash12(i+vec2(1.0,0.0));
  float c = hash12(i+vec2(0.0,1.0));
  float d = hash12(i+vec2(1.0,1.0));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float a = 0.0, w = 0.5;
  for (int i = 0; i < 5; i++){ a += w*vnoise(p); p = p*2.03 + vec2(17.3, 9.1); w *= 0.5; }
  return a;
}
float fbm3(vec2 p){
  float a = 0.0, w = 0.5;
  for (int i = 0; i < 3; i++){ a += w*vnoise(p); p = p*2.03 + vec2(17.3, 9.1); w *= 0.5; }
  return a;
}
float vor(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float md = 8.0;
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++){
    vec2 g = vec2(float(x), float(y));
    vec2 r = g + hash22(i+g) - f;
    md = min(md, dot(r, r));
  }
  return sqrt(md);
}
float vorEdge(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float f1 = 8.0, f2 = 8.0;
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++){
    vec2 g = vec2(float(x), float(y));
    vec2 r = g + hash22(i+g) - f;
    float d = dot(r, r);
    if (d < f1){ f2 = f1; f1 = d; } else if (d < f2){ f2 = d; }
  }
  return sqrt(f2) - sqrt(f1);
}
vec2 mapUV(vec3 reg, vec2 xz){ return (xz - reg.xy) / (2.0*reg.z) + 0.5; }
float regionMask(vec2 uv){
  vec2 e = abs(uv - 0.5);
  return 1.0 - smoothstep(0.44, 0.5, max(e.x, e.y));
}
float groundH(vec2 xz){
  vec2 uvf = mapUV(uRegFine, xz);   float mf = regionMask(uvf);
  float hf = texture2D(uMapFine, clamp(uvf, 0.0, 1.0)).r;
  return mix(0.0, hf, mf);
}
float visFrom(vec4 t){
  return t.g*uVisW.x + t.b*uVisW.y + max(1.0 - uVisW.x - uVisW.y, 0.0);
}
float sunVis(vec2 xz){
  vec2 uvf = mapUV(uRegFine, xz);   float mf = regionMask(uvf);
  float vf = visFrom(texture2D(uMapFine, clamp(uvf, 0.0, 1.0)));
  return mix(1.0, vf, mf);
}
float cloudShadow(vec2 xz){
  float n = fbm(xz*0.00062 + uTime*vec2(0.0046, 0.0013));
  return 0.45 + 0.55*smoothstep(0.30, 0.66, n);
}
float gust(vec2 xz){
  return fbm3(xz*0.05 - uWindDir*uTime*0.85);
}
vec3 skyRadiance(vec3 d){
  float sd = max(dot(d, uSunDir), 0.0);
  float y = d.y;
  float hz = exp(-max(y, 0.0)*6.5);
  float warmside = pow(sd*0.5 + 0.5, 6.0);
  vec3 horizon = mix(uHorizonCold, uHorizonWarm, warmside);
  vec3 col = mix(uSkyZenith, horizon, hz);
  col += uHorizonWarm * (pow(sd, 8.0)*0.12 + pow(sd, 64.0)*0.5);
  col = mix(col, uHorizonCold*0.65, smoothstep(0.0, -0.10, y));
  return col;
}
vec3 applyAtmo(vec3 col, vec3 wp){
  vec3 dv = wp - cameraPosition;
  float dist = length(dv);
  vec3 vd = dv / max(dist, 0.001);
  float sw = pow(max(dot(vd, uSunDir), 0.0), 6.0);
  float f = 1.0 - exp(-dist*6.5e-5);
  vec3 hazeCol = mix(uHorizonCold*0.9, uHorizonWarm*1.1, sw);
  float ha = max(cameraPosition.y - uWaterY, 0.0);
  float hb = max(wp.y - uWaterY, 0.0);
  float fall = 0.16;
  float ea = exp(-ha*fall), eb = exp(-hb*fall);
  float denom = fall*(hb - ha);
  float avg = (abs(denom) < 1e-3) ? ea : (ea - eb)/denom;
  float mist = 1.0 - exp(-dist*avg*0.0014);
  float svm = sunVis(mix(cameraPosition.xz, wp.xz, 0.6));
  vec3 mistCol = mix(uHorizonCold*0.85, uHorizonWarm*1.35, sw*(0.2 + 0.8*svm));
  col = mix(col, hazeCol, f);
  col = mix(col, mistCol, clamp(mist, 0.0, 1.0)*0.75);
  return col;
}
vec3 litSurface(vec3 albedo, vec3 N, vec3 wp, vec3 vd, float specAmt, float rough, float ao){
  float sv = sunVis(wp.xz) * cloudShadow(wp.xz);
  float ndl = max(dot(N, uSunDir), 0.0);
  vec3 col = albedo * uSunColor * ndl * sv;
  vec3 amb = mix(uGroundBounce, uSkyZenith*1.05, N.y*0.5 + 0.5);
  amb += uHorizonWarm * 0.10 * max(dot(N, normalize(vec3(uSunDir.x, 0.25, uSunDir.z))), 0.0);
  col += albedo * amb * ao;
  if (specAmt > 0.001){
    vec3 h = normalize(uSunDir - vd);
    float ndh = max(dot(N, h), 1e-4);
    float p = exp2(9.0*(1.0 - rough) + 1.0);
    float fres = 0.04 + 0.96*pow(max(1.0 - max(dot(N, -vd), 0.0), 1e-4), 5.0);
    col += uSunColor * sv * ndl * specAmt * fres * pow(ndh, p) * (p + 8.0) * 0.04;
  }
  return col;
}
`;

export const REF_TERRAIN_VERT = /* glsl */ `
attribute float aMask;
varying vec3 vWp;
varying vec3 vN;
varying float vMask;
void main(){
  vWp = (modelMatrix * vec4(position, 1.0)).xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vMask = aMask;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const REF_TERRAIN_FRAG = /* glsl */ `
${REF_COMMON}
varying vec3 vWp;
varying vec3 vN;
varying float vMask;

float microH(vec2 p){
  float peb = 1.0 - vor(p*17.0);
  float fine = vnoise(p*45.0);
  float crack = smoothstep(0.0, 0.12, vorEdge(p*2.6));
  return peb*0.55 + fine*0.25 + crack*0.20;
}

void main(){
  vec3 toP = vWp - cameraPosition;
  float dist = length(toP);
  vec3 vd = toP / max(dist, 0.001);
  vec3 N = normalize(vN);
  vec2 uvw = vWp.xz;
  float nearW = 1.0 - smoothstep(4.0, 26.0, dist);

  if (nearW > 0.01 && N.y > 0.6 && vd.y < -0.02){
    vec2 stp = vd.xz / max(0.30, -vd.y) * 0.05 * nearW;
    float hh = microH(uvw);
    uvw += stp * (1.0 - hh);
    hh = microH(uvw);
    uvw += stp * (1.0 - hh) * 0.5;
  }

  float slope = clamp(1.0 - N.y, 0.0, 1.0);
  float relH = vWp.y - uWaterY;
  float big = fbm(vWp.xz*0.018);

  float rockM  = smoothstep(0.16, 0.30, slope + (big - 0.5)*0.18);
  float screeM = smoothstep(0.085, 0.16, slope) * (1.0 - rockM) * smoothstep(8.0, 60.0, relH);
  float siltM  = (1.0 - smoothstep(0.045, 0.11, slope)) * (1.0 - smoothstep(0.9, 2.0, relH));
  float grassM = (1.0 - rockM) * (1.0 - screeM) * (1.0 - siltM)
               * smoothstep(0.30, 0.9, relH) * (1.0 - smoothstep(35.0, 80.0, relH))
               * smoothstep(0.33, 0.6, fbm(vWp.xz*0.045 + 7.0));

  float snowLine = 60.0 + 70.0*(fbm(vWp.xz*0.0045) - 0.5);
  float snowM = smoothstep(snowLine, snowLine + 40.0, relH);
  snowM *= smoothstep(0.60, 0.28, slope + (fbm(vWp.xz*0.02 + 3.0) - 0.5)*0.25);
  snowM *= 0.55 + 0.45*smoothstep(0.30, 0.55, fbm(vWp.xz*0.006 + 11.0));
  snowM = clamp(snowM*1.6, 0.0, 1.0);
  snowM = max(snowM, smoothstep(snowLine - 25.0, snowLine + 15.0, relH)*smoothstep(0.20, 0.06, slope)*0.7);

  vec3 aw = pow(abs(N) + 1e-4, vec3(3.0)); aw /= (aw.x + aw.y + aw.z);
  float strata = fbm(vec2(vWp.y*0.055 + fbm(vWp.xz*0.004)*6.0, (vWp.x + vWp.z)*0.002));
  float rdet = fbm(vWp.zy*0.11)*aw.x + fbm(vWp.xz*0.11)*aw.y + fbm(vWp.xy*0.11)*aw.z;
  vec3 rockCol = mix(vec3(0.235, 0.225, 0.215), vec3(0.34, 0.325, 0.30), rdet);
  rockCol *= 0.78 + 0.5*strata;
  rockCol *= 1.0 - 0.35*smoothstep(0.32, 0.20, strata);
  rockCol = mix(rockCol, vec3(0.50, 0.47, 0.43), smoothstep(0.62, 0.72, strata)*0.5);

  float lich = smoothstep(0.55, 0.62, vnoise(vWp.xz*1.4 + vWp.y*0.9)) * smoothstep(0.7, 0.5, rdet);
  vec3 lichCol = mix(vec3(0.45, 0.46, 0.18), vec3(0.55, 0.33, 0.12), vnoise(vWp.xz*0.8));
  rockCol = mix(rockCol, lichCol, lich*rockM*0.35*(1.0 - snowM)*smoothstep(300.0, 30.0, dist));

  vec3 screeCol = mix(vec3(0.30, 0.29, 0.28), vec3(0.385, 0.37, 0.35), vnoise(uvw*2.2));
  screeCol *= 0.85 + 0.3*vor(uvw*1.3);

  float gn = vnoise(uvw*3.0);
  vec3 grassCol = mix(vec3(0.085, 0.115, 0.045), vec3(0.21, 0.19, 0.085), gn);
  grassCol = mix(grassCol, vec3(0.27, 0.235, 0.12), smoothstep(0.6, 0.85, fbm(uvw*0.6))*0.6);
  vec3 lushCol = mix(vec3(0.055, 0.155, 0.030), vec3(0.115, 0.225, 0.055), gn);
  grassCol = mix(grassCol, lushCol, uGreen);
  vec3 fallCol = mix(vec3(0.33, 0.21, 0.06), vec3(0.46, 0.30, 0.10), gn);
  grassCol = mix(grassCol, fallCol, uAutumn);

  float mossM = smoothstep(1.2, 0.3, relH) * smoothstep(0.62, 0.82, fbm(uvw*0.9 + 4.0)) * (1.0 - siltM*0.6);
  vec3 mossCol = vec3(0.075, 0.16, 0.055);

  float peb = 1.0 - vor(uvw*17.0);
  float cracks = 1.0 - smoothstep(0.0, 0.10, vorEdge(uvw*2.6));
  vec3 siltCol = mix(vec3(0.30, 0.255, 0.205), vec3(0.40, 0.36, 0.30), vnoise(uvw*7.0));
  siltCol = mix(siltCol, vec3(0.34, 0.31, 0.27), smoothstep(0.45, 0.85, peb)*0.45);
  siltCol *= 1.0 - cracks*0.45*smoothstep(0.35, 1.0, relH)*nearW;

  vec3 alb = siltCol;
  alb = mix(alb, grassCol, grassM);
  alb = mix(alb, mossCol, mossM*0.7);
  alb = mix(alb, screeCol, screeM);
  alb = mix(alb, rockCol, rockM);

  float wetEdge = 0.22 + 0.30*vnoise(uvw*1.2);
  float wetM = 1.0 - smoothstep(0.02, wetEdge + 0.25, relH);
  wetM = clamp(max(wetM, mossM*0.4), 0.0, 1.0);
  alb *= 1.0 - 0.5*wetM;

  vec3 snowCol = vec3(0.84, 0.87, 0.96);
  float sast = sin(dot(vWp.xz, normalize(uWindDir))*0.9 + fbm(vWp.xz*0.05)*9.0);
  snowCol *= 0.93 + 0.07*sast;
  alb = mix(alb, snowCol, snowM);

  float e = 0.18;
  float h0 = microH(uvw);
  float hx = microH(uvw + vec2(e, 0.0));
  float hz = microH(uvw + vec2(0.0, e));
  vec3 mN = normalize(vec3(-(hx - h0)/e*0.35, 1.0, -(hz - h0)/e*0.35));
  N = normalize(mix(N, normalize(N + (mN - vec3(0.0, 1.0, 0.0))), nearW*(1.0 - rockM)*0.7));

  float ao = 1.0 - 0.30*cracks*nearW - 0.20*(1.0 - peb)*nearW*siltM;
  float specAmt = 0.05 + wetM*0.55 + snowM*0.10;
  float rough = mix(mix(0.82, 0.25, wetM), 0.55, snowM);
  vec3 col = litSurface(alb, N, vWp, vd, specAmt, rough, ao);

  float sparkM = max(snowM, wetM*0.2) * smoothstep(140.0, 8.0, dist);
  if (sparkM > 0.003){
    vec2 sp = vWp.xz*42.0 + vec2(dot(vd.xz, vec2(7.0)), vd.y*9.0);
    float g = step(0.992, hash12(floor(sp)));
    col += uSunColor * g * sparkM * 0.5 * 0.5;
  }

  col = applyAtmo(col, vWp);
  gl_FragColor = vec4(col, smoothstep(0.02, 0.2, vMask));
}
`;

export const REF_WATER_VERT = /* glsl */ `
varying vec3 vWp;
void main(){
  vWp = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const REF_WATER_FRAG = /* glsl */ `
${REF_COMMON}
varying vec3 vWp;

float wH(vec2 p, float t){
  float h = 0.0;
  h += vnoise(p*vec2(1.1, 2.6) + vec2(-t*1.35, t*0.18))*0.034;
  h += vnoise(p*vec2(2.6, 6.0) + vec2(-t*2.30, -t*0.32))*0.016;
  h += vnoise(p*vec2(5.6, 12.0) + vec2(-t*3.60, t*0.55))*0.008;
  h += vnoise(p*vec2(10.0, 22.0) + vec2(-t*5.20, t*0.90))*0.0045;
  h += vnoise(p*0.45 + vec2(-t*0.50, 0.0))*0.050;
  return h;
}

void main(){
  float t = uTime;
  vec3 toP = vWp - cameraPosition;
  float dist = length(toP);
  vec3 vd = toP / max(dist, 0.001);
  vec2 p = vWp.xz;

  float depth0 = max(uWaterY - groundH(p), 0.0);
  float sv = sunVis(p) * cloudShadow(p);

  float gA = groundH(p + vec2(2.0, 0.0));
  float gB = groundH(p - vec2(2.0, 0.0));
  float rapid = smoothstep(0.10, 0.45, abs(gA - gB)*0.5) * smoothstep(0.60, 0.12, depth0);

  float e = 0.045;
  float h0 = wH(p, t);
  float hx = wH(p + vec2(e, 0.0), t);
  float hz = wH(p + vec2(0.0, e), t);
  float nscale = (1.0 + rapid*1.4)/(1.0 + dist*0.010);
  vec3 N = normalize(vec3(-(hx - h0)/e*nscale, 1.0, -(hz - h0)/e*nscale));

  // refraction-pass substitute: lit bed estimate (no second render pass)
  vec3 rdir = refract(vd, vec3(0.0, 1.0, 0.0), 0.752);
  float depth = max(uWaterY - groundH(p + N.xz*depth0*1.5), 0.02);
  float path = depth / max(0.30, -rdir.y);
  vec3 bedAlb = mix(vec3(0.30, 0.255, 0.205), vec3(0.40, 0.36, 0.30), vnoise((p + N.xz*depth*2.0)*7.0));
  vec3 refr = bedAlb * (uSunColor*0.35*sv + uSkyZenith*0.8);

  vec2 cuv = (p + N.xz*depth*2.0)*1.05;
  float ca = pow(max(1.0 - vor(cuv*2.0 + vec2(-t*0.9, t*0.25)), 1e-4), 5.0)
           + pow(max(1.0 - vor(cuv*3.1 + vec2(-t*1.3, -t*0.30)), 1e-4), 5.0);
  refr *= 1.0 + ca * sv * 1.2 * exp(-depth*1.8);

  vec3 trans = exp(-path * vec3(0.62, 0.18, 0.14) * 1.5);
  float scA = 1.0 - exp(-path*0.30);
  vec3 sunAmb = uSunColor*0.10*sv + uSkyZenith*0.55;
  vec3 under = refr * trans + vec3(0.07, 0.38, 0.36) * scA * sunAmb;

  vec3 rd = reflect(vd, N);
  rd.y = max(rd.y, 0.02);
  vec3 refl = skyRadiance(rd);
  if (rd.y < 0.32){
    float tt = 25.0; vec3 hp = vWp; float hit = 0.0;
    for (int i = 0; i < 5; i++){
      hp = vWp + rd*tt;
      if (hp.y < groundH(hp.xz)){ hit = 1.0; break; }
      tt *= 2.3;
    }
    if (hit > 0.5){
      vec3 mcol = vec3(0.30, 0.295, 0.29) * (uSkyZenith*0.9 + uSunColor*0.22*sunVis(hp.xz));
      refl = mix(refl, applyAtmo(mcol, hp), 0.85);
    }
  }
  float fres = 0.02 + 0.98*pow(max(1.0 - max(dot(N, -vd), 0.0), 1e-4), 5.0);
  vec3 col = mix(under, refl, clamp(fres, 0.0, 1.0));

  vec3 hv = normalize(uSunDir - vd);
  float ndh = max(dot(N, hv), 1e-4);
  col += uSunColor * sv * (pow(ndh, 750.0)*1.6 + pow(ndh, 90.0)*0.07);

  float foamN = fbm(vec2(p.x*0.35 + t*1.2, p.y*1.3));
  float shore = smoothstep(0.16, 0.03, depth0);
  float streak = smoothstep(0.55, 0.80, fbm(vec2(p.x*0.10 + t*0.55, p.y*0.9)));
  float rapidN = smoothstep(0.35, 0.75, fbm(vec2(p.x*0.7 + t*2.8, p.y*2.2)));
  float foam = clamp(shore*(0.55 + 0.45*foamN)
             + streak*smoothstep(0.5, 0.15, depth0)*0.5
             + rapid*rapidN*0.9, 0.0, 1.0);
  vec3 foamCol = vec3(0.9) * (uSunColor*0.12*sv + uSkyZenith*0.7);
  col = mix(col, foamCol, foam*0.85);

  col = applyAtmo(col, vWp);
  gl_FragColor = vec4(col, clamp(depth0*3.0 + foam, 0.0, 0.97));
}
`;

export const REF_GRASS_VERT = /* glsl */ `
${REF_COMMON}
attribute vec3 aOffset;
attribute vec4 aParam;   // scale, yaw, phase, hue
varying vec3 vWp;
varying vec3 vNrm;
varying float vT;
varying float vHue;
void main(){
  float scale = aParam.x, yaw = aParam.y, phase = aParam.z;
  scale *= 1.0 + 0.45*uGreen;
  vHue = aParam.w;
  float cy = cos(yaw), sy = sin(yaw);
  vec3 lp = vec3(position.x*cy, position.y, -position.x*sy);
  vec3 ln = normalize(vec3(normal.z*sy, normal.y, normal.z*cy));
  float g = gust(aOffset.xz);
  float sway = sin(uTime*2.4 + phase + g*4.0);
  float bend = (0.10 + 1.0*g*g) * (0.65 + 0.35*sway);
  vec2 bdir = normalize(uWindDir + 0.35*vec2(sin(phase*7.0), cos(phase*3.0)));
  float t2 = position.y*position.y;
  vec3 wp = aOffset + lp*scale;
  wp.xz += bdir * bend * t2 * scale;
  wp.y  -= bend*bend * t2 * scale * 0.35;
  float flut = sin(uTime*(9.0 + 7.0*fract(phase*0.13)) + phase*23.0) * (0.10 + 0.90*g*g);
  vec2 fdir = vec2(-bdir.y, bdir.x);
  wp.xz += fdir * flut * 0.035 * t2 * scale;
  wp.y  -= abs(flut) * 0.012 * t2 * scale;
  vWp = wp;
  vNrm = ln;
  vT = position.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

export const REF_GRASS_FRAG = /* glsl */ `
${REF_COMMON}
varying vec3 vWp;
varying vec3 vNrm;
varying float vT;
varying float vHue;
void main(){
  vec3 toP = vWp - cameraPosition;
  float dist = length(toP);
  vec3 vd = toP / max(dist, 0.001);
  vec3 N = normalize(vNrm);
  if (!gl_FrontFacing) N = -N;
  N = normalize(mix(N, vec3(0.0, 1.0, 0.0), 0.4));

  vec3 colA = mix(vec3(0.10, 0.14, 0.05), vec3(0.05, 0.17, 0.03), uGreen);
  colA = mix(colA, vec3(0.30, 0.18, 0.05), uAutumn);
  vec3 colB = mix(vec3(0.24, 0.21, 0.09), vec3(0.10, 0.24, 0.05), uGreen);
  colB = mix(colB, vec3(0.42, 0.26, 0.07), uAutumn);
  vec3 alb = mix(colA, colB, vHue);
  alb *= mix(0.45, 1.05, vT);

  float sv = sunVis(vWp.xz) * cloudShadow(vWp.xz);
  float ndl = max(dot(N, uSunDir), 0.0)*0.7 + 0.3;
  vec3 col = alb * uSunColor * ndl * sv;
  col += alb * mix(uGroundBounce, uSkyZenith*1.3, 0.75);
  float back = pow(max(dot(vd, uSunDir), 1e-4), 4.0);
  col += alb * uSunColor * back * sv * (0.5 + 0.4*vT);
  col = applyAtmo(col, vWp);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const REF_ROCK_VERT = /* glsl */ `
${REF_COMMON}
attribute vec3 aOffset;
attribute vec4 aParam;   // scale, yaw, seed, flatten
varying vec3 vWp;
varying vec3 vNrm;
varying float vSeed;
varying float vScale;
void main(){
  float scale = aParam.x, yaw = aParam.y, seed = aParam.z, flat_ = aParam.w;
  vSeed = seed;
  vScale = scale;
  vec3 lp = position * vec3(1.0, flat_, 1.0);
  vec3 ln = normalize(normal / vec3(1.0, flat_, 1.0));
  float n = (vnoise(lp.xy*2.3 + seed) + vnoise(lp.yz*2.3 + seed*1.7) + vnoise(lp.zx*2.3 + seed*2.3))/3.0;
  float n2 = vnoise(lp.xz*5.0 + seed*3.1);
  lp *= 0.58 + 0.64*n + 0.16*n2;
  ln = normalize(mix(ln, normalize(lp), 0.7));
  float cy = cos(yaw), sy = sin(yaw);
  vec3 rp = vec3(lp.x*cy + lp.z*sy, lp.y, -lp.x*sy + lp.z*cy);
  vec3 rn = vec3(ln.x*cy + ln.z*sy, ln.y, -ln.x*sy + ln.z*cy);
  vec3 wp = aOffset + rp*scale;
  vWp = wp;
  vNrm = rn;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

export const REF_ROCK_FRAG = /* glsl */ `
${REF_COMMON}
varying vec3 vWp;
varying vec3 vNrm;
varying float vSeed;
varying float vScale;
void main(){
  vec3 toP = vWp - cameraPosition;
  float dist = length(toP);
  vec3 vd = toP / max(dist, 0.001);
  vec3 N = normalize(vNrm);

  vec3 aw = pow(abs(N) + 1e-4, vec3(3.0)); aw /= (aw.x + aw.y + aw.z);
  float det = fbm(vWp.zy*1.4 + vSeed)*aw.x + fbm(vWp.xz*1.4 + vSeed)*aw.y + fbm(vWp.xy*1.4 + vSeed)*aw.z;
  float hue = hash12(vec2(vSeed, vSeed*1.7));
  vec3 alb = mix(vec3(0.30, 0.29, 0.28), vec3(0.46, 0.43, 0.39), det);
  alb = mix(alb, vec3(0.38, 0.33, 0.27), hue*0.35);
  alb *= 0.85 + 0.3*vnoise(vWp.xz*8.0 + vSeed);
  alb *= mix(1.0, 0.72, smoothstep(0.4, 1.5, vScale));

  float relH = vWp.y - uWaterY;
  float lich = smoothstep(0.60, 0.68, vnoise(vWp.xz*3.0 + vSeed*5.0)) * smoothstep(0.3, 0.9, relH) * max(N.y, 0.0);
  vec3 lichCol = mix(vec3(0.48, 0.48, 0.18), vec3(0.58, 0.34, 0.12), hash12(vec2(vSeed*3.0, 1.0)));
  alb = mix(alb, lichCol, lich*0.22*smoothstep(120.0, 20.0, dist));

  float mossM = smoothstep(0.7, 0.10, relH) * smoothstep(0.2, 0.7, N.y) * smoothstep(0.55, 0.8, vnoise(vWp.xz*2.0 + vSeed));
  alb = mix(alb, vec3(0.07, 0.15, 0.05), mossM*0.6);

  float wetM = 1.0 - smoothstep(0.02, 0.30 + 0.25*vnoise(vWp.xz*2.5), relH);
  wetM = clamp(wetM + (vWp.y < uWaterY + 0.02 ? 1.0 : 0.0), 0.0, 1.0);
  alb *= 1.0 - 0.50*wetM;

  vec3 dN = normalize(N + 0.25*vec3(vnoise(vWp.yz*14.0) - 0.5, vnoise(vWp.xz*14.0) - 0.5, vnoise(vWp.xy*14.0) - 0.5));
  float specAmt = 0.08 + wetM*0.7;
  float rough = mix(0.7, 0.15, wetM);

  float sv = sunVis(vWp.xz) * cloudShadow(vWp.xz);
  float ndl = max(dot(dN, uSunDir), 0.0);
  vec3 col = alb * uSunColor * ndl * sv;
  vec3 amb = mix(uGroundBounce, uSkyZenith*1.05, dN.y*0.5 + 0.5);
  col += alb * amb * (0.55 + 0.45*max(dN.y, 0.0));
  vec3 hv = normalize(uSunDir - vd);
  float pw = exp2(9.0*(1.0 - rough) + 1.0);
  float fres = 0.04 + 0.96*pow(max(1.0 - max(dot(dN, -vd), 0.0), 1e-4), 5.0);
  col += uSunColor * sv * ndl * specAmt * fres * pow(max(dot(dN, hv), 1e-4), pw) * (pw + 8.0)*0.04;

  col = applyAtmo(col, vWp);
  gl_FragColor = vec4(col, 1.0);
}
`;
