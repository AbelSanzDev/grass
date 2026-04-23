import * as THREE from 'three';

var DEFAULTS = {
  floorSize: 26,
  bladeCount: 12000,
  bladeHeight: 0.52,
  footprintCount: 50,
  maxDeathMarks: 10,
  maxCrushPoints: 8,
  playerRadius: 0.75,
  crowdRadius: 0.75,
  crushStrength: 1.0,
  sunDirection: new THREE.Vector3(-0.27, 0.94, 0.4).normalize(),
  sunColor: new THREE.Color(1, 0.94, 0.78),
  sunIntensity: 2.6,
  ambientColor: new THREE.Color(0.08, 0.075, 0.055)
};

var SHARED_DUMMY = new THREE.Object3D();

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function cloneColorVec3(input) {
  if (input && input.isColor) return new THREE.Vector3(input.r, input.g, input.b);
  if (input && input.isVector3) return input.clone();
  return new THREE.Vector3(1, 1, 1);
}

function disposeMaterial(mat) {
  if (!mat) return;
  var mats = Array.isArray(mat) ? mat : [mat];
  for (var i = 0; i < mats.length; i++) {
    if (mats[i].map) mats[i].map.dispose();
    mats[i].dispose();
  }
}

function createGroundMaterial(instance) {
  var mat = new THREE.MeshStandardMaterial({
    color: 0x2a1a0c,
    roughness: 0.96,
    metalness: 0.0
  });

  mat.customProgramCacheKey = function () { return 'standalone_reactive_grass_ground'; };
  mat.onBeforeCompile = function (shader) {
    shader.uniforms.uGrassTime = { value: 0 };
    shader.uniforms.uPlayerPos = { value: new THREE.Vector3(9999, 0, 9999) };
    shader.uniforms.uPlayerVel = { value: new THREE.Vector3() };
    shader.uniforms.uDashPos = { value: new THREE.Vector3(9999, 0, 9999) };
    shader.uniforms.uDashDir = { value: new THREE.Vector3(0, 0, 1) };
    shader.uniforms.uDashLife = { value: 0 };
    shader.uniforms.uPlayerCrushRadius = { value: instance.crushConfig.playerRadius };
    shader.uniforms.uDeathMarks = { value: instance.deathMarkVecs };
    shader.uniforms.uDeathMarkCount = { value: 0 };

    shader.vertexShader = [
      'uniform float uGrassTime;',
      'uniform vec3 uPlayerPos;',
      'uniform vec3 uPlayerVel;',
      'uniform vec3 uDashPos;',
      'uniform vec3 uDashDir;',
      'uniform float uDashLife;',
      'uniform float uPlayerCrushRadius;',
      'varying vec3 vGrassWP;',
      shader.vertexShader
    ].join('\n');

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      [
        '#include <begin_vertex>',
        'vec3 wp0 = (modelMatrix * vec4(position, 1.0)).xyz;',
        'float pd = length(wp0.xz - uPlayerPos.xz);',
        'float wakeR = max(uPlayerCrushRadius * 1.35, 0.08);',
        'float playerWake = smoothstep(wakeR, 0.0, pd);',
        'float dashWake = smoothstep(5.0, 0.0, length(wp0.xz - uDashPos.xz)) * uDashLife;',
        'float wind = sin(wp0.x * 0.34 + wp0.z * 0.22 + uGrassTime * 1.8) * 0.5 + 0.5;',
        'transformed.z += (wind * 0.018 - playerWake * 0.018 - dashWake * 0.026);'
      ].join('\n')
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvGrassWP = worldPosition.xyz;'
    );

    shader.fragmentShader = [
      'uniform float uGrassTime;',
      'uniform vec3 uPlayerPos;',
      'uniform vec3 uDashPos;',
      'uniform float uDashLife;',
      'uniform float uPlayerCrushRadius;',
      'uniform vec2 uDeathMarks[' + instance.maxDeathMarks + '];',
      'uniform int uDeathMarkCount;',
      'varying vec3 vGrassWP;',
      'float grassHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
      'float grassNoise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);return mix(mix(grassHash(i),grassHash(i+vec2(1.0,0.0)),u.x),mix(grassHash(i+vec2(0.0,1.0)),grassHash(i+vec2(1.0,1.0)),u.x),u.y);}',
      shader.fragmentShader
    ].join('\n');

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      [
        'vec2 gp = vGrassWP.xz;',
        'float broad = grassNoise(gp * 0.13);',
        'float fine = grassNoise(gp * 1.45 + broad);',
        'float pebble = grassNoise(gp * 5.0 + vec2(3.1, 7.4));',
        'float trackR = max(uPlayerCrushRadius * 0.95, 0.06);',
        'float track = smoothstep(trackR, 0.0, length(gp - uPlayerPos.xz));',
        'float dashTrack = smoothstep(3.8, 0.0, length(gp - uDashPos.xz)) * uDashLife;',
        'vec3 dirtDark = vec3(0.06, 0.035, 0.015);',
        'vec3 dirtMid = vec3(0.12, 0.07, 0.03);',
        'vec3 dirtWarm = vec3(0.16, 0.09, 0.04);',
        'vec3 gcol = mix(dirtDark, dirtMid, broad);',
        'gcol = mix(gcol, dirtWarm, fine * 0.30);',
        'gcol = mix(gcol, dirtDark * 0.8, pebble * 0.12);',
        'gcol = mix(gcol, dirtDark * 0.7, track * 0.25 + dashTrack * 0.18);',
        'float gScorch = 0.0;',
        'for (int i = 0; i < ' + instance.maxDeathMarks + '; i++) {',
        '  if (i >= uDeathMarkCount) break;',
        '  vec2 sd2 = gp - uDeathMarks[i];',
        '  gScorch = max(gScorch, 1.0 - smoothstep(0.0, 4.0, dot(sd2, sd2)));',
        '}',
        'gcol = mix(gcol, vec3(0.015, 0.01, 0.005), gScorch * 0.9);',
        'diffuseColor.rgb = gcol;'
      ].join('\n')
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      [
        'float ringR = max(uPlayerCrushRadius * 0.9, 0.08);',
        'float ringW = max(uPlayerCrushRadius * 0.2, 0.03);',
        'float ring = smoothstep(ringW, 0.0, abs(length(vGrassWP.xz - uPlayerPos.xz) - ringR));',
        'gl_FragColor.rgb += vec3(0.08, 0.05, 0.02) * ring * 0.08;',
        '#include <dithering_fragment>'
      ].join('\n')
    );

    mat.userData.shader = shader;
  };

  return mat;
}

function createBladeMesh(instance) {
  var count = instance.bladeCount;
  if (count <= 0) return null;

  var clumpBlades = 48;
  var segs = 2;
  var vertsPerBlade = (segs + 1) * 2;
  var trisPerBlade = segs * 2;
  var totalVerts = clumpBlades * vertsPerBlade;
  var totalTris = clumpBlades * trisPerBlade;
  var positions = new Float32Array(totalVerts * 3);
  var uvs = new Float32Array(totalVerts * 2);
  var indices = new Uint32Array(totalTris * 3);

  function bhash(seed) { return ((seed * 1597 + 51749) % 32749) / 32749; }

  for (var bi = 0; bi < clumpBlades; bi++) {
    var spreadA = bi * 2.399963229728653;
    var faceA = spreadA + ((bi % 5) - 2) * 0.19;
    var ringT = ((bi * 37) % 100) / 100;
    var rootR = 0.015 + ringT * 0.13;
    var variety = bhash(bi * 7 + 3);
    var widthBase = 0.007 + variety * 0.013;
    var widthTaper = 0.15 + bhash(bi * 13 + 1) * 0.5;
    var h = instance.bladeHeight * (0.45 + bhash(bi * 11 + 5) * 0.6);
    var curvature = 0.04 + bhash(bi * 19 + 7) * 0.12;
    var curveBias = (bhash(bi * 23 + 9) - 0.5) * 0.06;
    var rootX = Math.cos(spreadA) * rootR;
    var rootZ = Math.sin(spreadA) * rootR;
    var ca = Math.cos(faceA);
    var sa = Math.sin(faceA);
    var baseVi = bi * vertsPerBlade;

    for (var si = 0; si <= segs; si++) {
      var t = si / segs;
      var t2 = t * t;
      var bendFwd = curvature * t2;
      var bendSide = curveBias * t2;
      var segY = h * t;
      var w = widthBase * (1.0 - t * widthTaper);
      var cx = rootX + ca * bendFwd + (-sa) * bendSide;
      var cz = rootZ + sa * bendFwd + ca * bendSide;
      var sideX = -sa * w;
      var sideZ = ca * w;
      var vi = baseVi + si * 2;
      var pi = vi * 3;
      positions[pi] = cx - sideX;
      positions[pi + 1] = segY;
      positions[pi + 2] = cz - sideZ;
      positions[pi + 3] = cx + sideX;
      positions[pi + 4] = segY;
      positions[pi + 5] = cz + sideZ;
      var ui = vi * 2;
      uvs[ui] = 0; uvs[ui + 1] = t;
      uvs[ui + 2] = 1; uvs[ui + 3] = t;
    }

    var baseIdx = bi * trisPerBlade * 3;
    for (var si2 = 0; si2 < segs; si2++) {
      var v0 = baseVi + si2 * 2;
      var ii = baseIdx + si2 * 6;
      indices[ii] = v0;
      indices[ii + 1] = v0 + 1;
      indices[ii + 2] = v0 + 2;
      indices[ii + 3] = v0 + 1;
      indices[ii + 4] = v0 + 3;
      indices[ii + 5] = v0 + 2;
    }
  }

  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();

  var phases = new Float32Array(count);
  var tones = new Float32Array(count);
  var dummy = new THREE.Object3D();
  var mat4 = new THREE.Matrix4();
  var half = instance.floorSize * 0.5 - 0.65;

  var mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPlayerPos: { value: new THREE.Vector3(9999, 0, 9999) },
      uPlayerVel: { value: new THREE.Vector3() },
      uDashPos: { value: new THREE.Vector3(9999, 0, 9999) },
      uDashDir: { value: new THREE.Vector3(0, 0, 1) },
      uDashLife: { value: 0 },
      uDeathMarks: { value: instance.deathMarkVecs },
      uDeathMarkCount: { value: 0 },
      uCrushPoints: { value: instance.crushPoints },
      uCrushCount: { value: 0 },
      uPlayerCrushRadius: { value: instance.crushConfig.playerRadius },
      uCrowdCrushRadius: { value: instance.crushConfig.crowdRadius },
      uCrushStrength: { value: instance.crushConfig.strength },
      uSunDir: { value: instance.sunDirection.clone() },
      uSunColor: { value: cloneColorVec3(instance.sunColor) },
      uSunIntensity: { value: instance.sunIntensity },
      uAmbientColor: { value: cloneColorVec3(instance.ambientColor) }
    },
    vertexShader: [
      'uniform float uTime;',
      'uniform vec3 uPlayerPos;',
      'uniform vec3 uPlayerVel;',
      'uniform vec3 uDashPos;',
      'uniform vec3 uDashDir;',
      'uniform float uDashLife;',
      'uniform vec2 uDeathMarks[' + instance.maxDeathMarks + '];',
      'uniform int uDeathMarkCount;',
      'uniform vec2 uCrushPoints[' + instance.maxCrushPoints + '];',
      'uniform int uCrushCount;',
      'uniform float uPlayerCrushRadius;',
      'uniform float uCrowdCrushRadius;',
      'uniform float uCrushStrength;',
      'attribute float iPhase;',
      'attribute float iTone;',
      'varying vec2 vUv;',
      'varying float vTone;',
      'varying float vReact;',
      'varying float vTip;',
      'varying float vScorch;',
      'varying vec3 vWorldNormal;',
      'void main() {',
      '  vUv = uv;',
      '  vTone = iTone;',
      '  mat4 worldInst = modelMatrix * instanceMatrix;',
      '  vec4 world = worldInst * vec4(position, 1.0);',
      '  vec4 baseW = worldInst[3];',
      '  float tip = pow(uv.y, 1.2);',
      '  vTip = uv.y;',
      '  vec2 fromPlayer = baseW.xz - uPlayerPos.xz;',
      '  float distP = length(fromPlayer);',
      '  vec2 away = normalize(fromPlayer + vec2(0.0001, 0.0001));',
      '  float speedT = clamp(length(uPlayerVel.xz) / 9.0, 0.0, 1.0);',
      '  float crush = smoothstep(uPlayerCrushRadius, 0.0, distP);',
      '  for (int ci = 0; ci < ' + instance.maxCrushPoints + '; ci++) {',
      '    if (ci >= uCrushCount) break;',
      '    vec2 cd2 = baseW.xz - uCrushPoints[ci];',
      '    float cdsq = dot(cd2, cd2);',
      '    crush = max(crush, 1.0 - smoothstep(0.0, uCrowdCrushRadius * uCrowdCrushRadius, cdsq));',
      '  }',
      '  float crushAmt = crush * uCrushStrength;',
      '  float idleOuter = max(uPlayerCrushRadius * 1.4, 0.1);',
      '  float idleInner = max(uPlayerCrushRadius * 0.3, 0.03);',
      '  float walkOuter = max(uPlayerCrushRadius * 1.9, 0.12);',
      '  float walkInner = max(uPlayerCrushRadius * 0.42, 0.04);',
      '  float idle = smoothstep(idleOuter, idleInner, distP) * 0.5;',
      '  float walk = smoothstep(walkOuter, walkInner, distP) * speedT * 0.45;',
      '  float react = idle + walk;',
      '  vec2 windDir = normalize(vec2(0.65, 0.34));',
      '  float wPhase = iPhase + baseW.x * 0.28 + baseW.z * 0.18;',
      '  float wind = sin(uTime * 0.8 + wPhase) * 0.6 + sin(uTime * 0.42 + wPhase * 1.7 + iTone * 1.5) * 0.4;',
      '  vec2 dashDir = normalize(uDashDir.xz + vec2(0.0001, 0.0001));',
      '  vec2 dashDelta = baseW.xz - uDashPos.xz;',
      '  float dashDist = length(dashDelta);',
      '  float dashCone = smoothstep(-0.25, 0.85, dot(normalize(dashDelta + vec2(0.0001)), dashDir));',
      '  float dash = smoothstep(5.6, 0.0, dashDist) * dashCone * uDashLife;',
      '  world.xz += (windDir * wind * 0.11 + away * react * 0.28 + dashDir * dash * 0.42) * tip;',
      '  world.y -= (react * 0.12 + dash * 0.16 + crushAmt * 0.38) * tip;',
      '  world.xz += away * crushAmt * 0.12 * tip;',
      '  vReact = max(react, max(dash, crushAmt));',
      '  float sc = 0.0;',
      '  for (int i = 0; i < ' + instance.maxDeathMarks + '; i++) {',
      '    if (i >= uDeathMarkCount) break;',
      '    vec2 dd2 = baseW.xz - uDeathMarks[i];',
      '    float ddsq = dot(dd2, dd2);',
      '    sc = max(sc, 1.0 - smoothstep(0.0, 4.0, ddsq));',
      '  }',
      '  vScorch = sc;',
      '  world.y -= sc * 0.15 * tip;',
      '  vec3 wn = normalize((worldInst * vec4(normal, 0.0)).xyz);',
      '  vWorldNormal = wn;',
      '  gl_Position = projectionMatrix * viewMatrix * world;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 uSunDir;',
      'uniform vec3 uSunColor;',
      'uniform float uSunIntensity;',
      'uniform vec3 uAmbientColor;',
      'varying vec2 vUv;',
      'varying float vTone;',
      'varying float vReact;',
      'varying float vTip;',
      'varying float vScorch;',
      'varying vec3 vWorldNormal;',
      'void main() {',
      '  vec3 base = mix(vec3(0.08, 0.24, 0.045), vec3(0.22, 0.48, 0.10), vTone);',
      '  vec3 tipCol = vec3(0.38, 0.52, 0.15);',
      '  vec3 albedo = mix(base, tipCol, vTip * 0.5);',
      '  vec3 pressed = vec3(0.06, 0.10, 0.03);',
      '  albedo = mix(albedo, pressed, vReact * 0.5);',
      '  albedo = mix(albedo, vec3(0.02, 0.015, 0.01), vScorch * 0.92);',
      '  vec3 N = normalize(vWorldNormal);',
      '  float NdotL = max(dot(N, uSunDir), 0.0);',
      '  float wrap = NdotL * 0.7 + 0.3;',
      '  vec3 lit = albedo * (uAmbientColor + uSunColor * uSunIntensity * wrap * 0.35);',
      '  float scatter = max(dot(-N, uSunDir), 0.0) * vTip * 0.12;',
      '  lit += albedo * uSunColor * scatter;',
      '  gl_FragColor = vec4(lit, 1.0);',
      '}'
    ].join('\n'),
    side: THREE.DoubleSide
  });

  var mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;

  var cols = Math.ceil(Math.sqrt(count));
  var rows = Math.ceil(count / cols);
  var stepX = (half * 2) / cols;
  var stepZ = (half * 2) / rows;
  for (var i = 0; i < count; i++) {
    var cx = i % cols;
    var cz = Math.floor(i / cols);
    var x = -half + (cx + 0.5) * stepX + (Math.random() - 0.5) * stepX * 0.86;
    var z = -half + (cz + 0.5) * stepZ + (Math.random() - 0.5) * stepZ * 0.86;
    var edgeFade = Math.min(1, (half - Math.max(Math.abs(x), Math.abs(z))) / 1.4);
    var sc = (0.72 + Math.random() * 0.48) * Math.max(0.7, edgeFade);
    dummy.position.set(x, 0.02, z);
    dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    dummy.scale.setScalar(sc);
    dummy.updateMatrix();
    mat4.copy(dummy.matrix);
    mesh.setMatrixAt(i, mat4);
    phases[i] = Math.random() * Math.PI * 2;
    tones[i] = 0.35 + Math.random() * 0.65;
  }

  mesh.instanceMatrix.needsUpdate = true;
  geo.setAttribute('iPhase', new THREE.InstancedBufferAttribute(phases, 1));
  geo.setAttribute('iTone', new THREE.InstancedBufferAttribute(tones, 1));
  return mesh;
}

function createFootprints(instance) {
  var geo = new THREE.CircleGeometry(1, 20);
  geo.rotateX(-Math.PI / 2);
  var opacity = new Float32Array(instance.footprintCount);
  geo.setAttribute('iOpacity', new THREE.InstancedBufferAttribute(opacity, 1));

  var mat = new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: [
      'attribute float iOpacity;',
      'varying vec2 vUv;',
      'varying float vOpacity;',
      'void main() {',
      '  vUv = uv;',
      '  vOpacity = iOpacity;',
      '  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);',
      '  gl_Position = projectionMatrix * mvPosition;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'varying vec2 vUv;',
      'varying float vOpacity;',
      'void main() {',
      '  float d = length(vUv - 0.5) * 2.0;',
      '  float a = (1.0 - smoothstep(0.15, 0.85, d)) * vOpacity;',
      '  gl_FragColor = vec4(0.03, 0.02, 0.008, a * 0.65);',
      '}'
    ].join('\n'),
    transparent: true,
    depthWrite: false
  });

  var mesh = new THREE.InstancedMesh(geo, mat, instance.footprintCount);
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  for (var i = 0; i < instance.footprintCount; i++) {
    SHARED_DUMMY.position.set(0, -999, 0);
    SHARED_DUMMY.scale.set(0.001, 0.001, 0.001);
    SHARED_DUMMY.updateMatrix();
    mesh.setMatrixAt(i, SHARED_DUMMY.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

export function createReactiveGrass(options) {
  var opts = Object.assign({}, DEFAULTS, options || {});

  var instance = {
    floorSize: opts.floorSize,
    bladeCount: opts.bladeCount,
    bladeHeight: opts.bladeHeight,
    footprintCount: opts.footprintCount,
    maxDeathMarks: opts.maxDeathMarks,
    maxCrushPoints: opts.maxCrushPoints,
    sunDirection: opts.sunDirection.clone ? opts.sunDirection.clone() : DEFAULTS.sunDirection.clone(),
    sunColor: opts.sunColor && opts.sunColor.isColor ? opts.sunColor.clone() : DEFAULTS.sunColor.clone(),
    sunIntensity: opts.sunIntensity,
    ambientColor: opts.ambientColor && opts.ambientColor.isColor ? opts.ambientColor.clone() : DEFAULTS.ambientColor.clone(),
    playerPos: new THREE.Vector3(9999, 0, 9999),
    playerVel: new THREE.Vector3(),
    dashPos: new THREE.Vector3(9999, 0, 9999),
    dashDir: new THREE.Vector3(0, 0, 1),
    dashLife: 0,
    time: 0,
    crushConfig: {
      playerRadius: opts.playerRadius,
      crowdRadius: opts.crowdRadius,
      strength: opts.crushStrength
    },
    crushPoints: [],
    crushPointCount: 0,
    deathMarks: [],
    deathMarkVecs: [],
    footprints: [],
    footprintCursor: 0
  };

  for (var i = 0; i < instance.maxDeathMarks; i++) instance.deathMarkVecs.push(new THREE.Vector2(9999, 9999));
  for (var j = 0; j < instance.maxCrushPoints; j++) instance.crushPoints.push(new THREE.Vector2(9999, 9999));

  instance.root = new THREE.Group();
  instance.root.name = 'reactive-grass';

  var groundGeo = new THREE.PlaneGeometry(instance.floorSize - 0.3, instance.floorSize - 0.3, 32, 32);
  var groundMat = createGroundMaterial(instance);
  instance.ground = new THREE.Mesh(groundGeo, groundMat);
  instance.ground.rotation.x = -Math.PI / 2;
  instance.ground.position.y = 0.012;
  instance.ground.receiveShadow = true;
  instance.ground.renderOrder = 0;
  instance.root.add(instance.ground);

  instance.blades = createBladeMesh(instance);
  if (instance.blades) instance.root.add(instance.blades);

  instance.footprintsMesh = createFootprints(instance);
  instance.footprintsMesh.position.y = 0.018;
  instance.root.add(instance.footprintsMesh);

  for (var fp = 0; fp < instance.footprintCount; fp++) {
    instance.footprints.push({ life: 0, maxLife: 1, x: 0, z: 0, sx: 1, sz: 1, rot: 0, intensity: 0 });
  }

  return instance;
}

export function attachReactiveGrass(instance, parent) {
  if (!instance || !parent) return;
  parent.add(instance.root);
}

function setCommonUniforms(instance, uniforms) {
  if (!uniforms) return;
  if (uniforms.uGrassTime) uniforms.uGrassTime.value = instance.time;
  if (uniforms.uTime) uniforms.uTime.value = instance.time;
  if (uniforms.uPlayerPos) uniforms.uPlayerPos.value.copy(instance.playerPos);
  if (uniforms.uPlayerVel) uniforms.uPlayerVel.value.copy(instance.playerVel);
  if (uniforms.uDashPos) uniforms.uDashPos.value.copy(instance.dashPos);
  if (uniforms.uDashDir) uniforms.uDashDir.value.copy(instance.dashDir);
  if (uniforms.uDashLife) uniforms.uDashLife.value = instance.dashLife;
  if (uniforms.uDeathMarks) {
    uniforms.uDeathMarks.value = instance.deathMarkVecs;
    uniforms.uDeathMarkCount.value = instance.deathMarks.length;
  }
  if (uniforms.uCrushPoints) {
    uniforms.uCrushPoints.value = instance.crushPoints;
    uniforms.uCrushCount.value = instance.crushPointCount;
  }
  if (uniforms.uPlayerCrushRadius) uniforms.uPlayerCrushRadius.value = instance.crushConfig.playerRadius;
  if (uniforms.uCrowdCrushRadius) uniforms.uCrowdCrushRadius.value = instance.crushConfig.crowdRadius;
  if (uniforms.uCrushStrength) uniforms.uCrushStrength.value = instance.crushConfig.strength;
  if (uniforms.uSunDir) uniforms.uSunDir.value.copy(instance.sunDirection);
  if (uniforms.uSunColor) uniforms.uSunColor.value.copy(cloneColorVec3(instance.sunColor));
  if (uniforms.uSunIntensity) uniforms.uSunIntensity.value = instance.sunIntensity;
  if (uniforms.uAmbientColor) uniforms.uAmbientColor.value.copy(cloneColorVec3(instance.ambientColor));
}

export function setReactiveGrassPlayerState(instance, playerPos, playerVel) {
  if (!instance) return;
  if (playerPos) instance.playerPos.copy(playerPos);
  if (playerVel) instance.playerVel.copy(playerVel);
}

export function updateReactiveGrass(instance, dt) {
  if (!instance) return;

  instance.time += dt;
  instance.dashLife = Math.max(0, instance.dashLife - dt * 1.55);

  var groundShader = instance.ground.material.userData.shader;
  if (groundShader) setCommonUniforms(instance, groundShader.uniforms);
  if (instance.blades && instance.blades.material && instance.blades.material.uniforms) {
    setCommonUniforms(instance, instance.blades.material.uniforms);
  }

  var mesh = instance.footprintsMesh;
  var opAttr = mesh.geometry.attributes.iOpacity;
  var anyUpdate = false;
  for (var i = 0; i < instance.footprints.length; i++) {
    var fp = instance.footprints[i];
    if (fp.life > 0) {
      fp.life = Math.max(0, fp.life - dt);
      var t = fp.maxLife > 0 ? fp.life / fp.maxLife : 0;
      var grow = 1 + (1 - t) * 0.12;
      SHARED_DUMMY.position.set(fp.x, 0, fp.z);
      SHARED_DUMMY.rotation.set(0, fp.rot, 0);
      SHARED_DUMMY.scale.set(fp.sx * grow, 1, fp.sz * grow);
      SHARED_DUMMY.updateMatrix();
      mesh.setMatrixAt(i, SHARED_DUMMY.matrix);
      opAttr.setX(i, t * fp.intensity);
      anyUpdate = true;
    } else if (opAttr.getX(i) !== 0) {
      SHARED_DUMMY.position.set(0, -999, 0);
      SHARED_DUMMY.scale.set(0.001, 0.001, 0.001);
      SHARED_DUMMY.updateMatrix();
      mesh.setMatrixAt(i, SHARED_DUMMY.matrix);
      opAttr.setX(i, 0);
      anyUpdate = true;
    }
  }

  if (anyUpdate) {
    mesh.instanceMatrix.needsUpdate = true;
    opAttr.needsUpdate = true;
  }
}

export function addGrassFootstep(instance, x, z, intensity) {
  if (!instance) return;
  var fp = instance.footprints[instance.footprintCursor];
  instance.footprintCursor = (instance.footprintCursor + 1) % instance.footprints.length;
  var i = Math.max(0.35, Math.min(1.6, intensity || 1));
  fp.life = fp.maxLife = 2.5 + i * 0.8;
  fp.x = x;
  fp.z = z;
  fp.sx = 0.55 + i * 0.18;
  fp.sz = 0.85 + i * 0.28;
  fp.rot = Math.random() * Math.PI * 2;
  fp.intensity = clamp01(0.75 + i * 0.25);
}

export function setGrassCrushPoints(instance, positions) {
  if (!instance) return;
  instance.crushPointCount = Math.min(positions.length, instance.maxCrushPoints);
  for (var i = 0; i < instance.maxCrushPoints; i++) {
    if (i < instance.crushPointCount) {
      instance.crushPoints[i].set(positions[i].x, positions[i].z);
    } else {
      instance.crushPoints[i].set(9999, 9999);
    }
  }
}

export function clearGrassCrushPoints(instance) {
  if (!instance) return;
  instance.crushPointCount = 0;
  for (var i = 0; i < instance.maxCrushPoints; i++) instance.crushPoints[i].set(9999, 9999);
}

export function setGrassCrushConfig(instance, config) {
  if (!instance || !config) return;
  if (typeof config.playerRadius === 'number' && isFinite(config.playerRadius)) instance.crushConfig.playerRadius = Math.max(0.05, config.playerRadius);
  if (typeof config.crowdRadius === 'number' && isFinite(config.crowdRadius)) instance.crushConfig.crowdRadius = Math.max(0.05, config.crowdRadius);
  if (typeof config.strength === 'number' && isFinite(config.strength)) instance.crushConfig.strength = Math.max(0, config.strength);
}

export function getGrassCrushConfig(instance) {
  return {
    playerRadius: instance.crushConfig.playerRadius,
    crowdRadius: instance.crushConfig.crowdRadius,
    strength: instance.crushConfig.strength
  };
}

export function addGrassDeathMark(instance, x, z) {
  if (!instance) return;
  if (instance.deathMarks.length >= instance.maxDeathMarks) instance.deathMarks.shift();
  instance.deathMarks.push({ x: x, z: z });
  for (var i = 0; i < instance.maxDeathMarks; i++) {
    if (i < instance.deathMarks.length) instance.deathMarkVecs[i].set(instance.deathMarks[i].x, instance.deathMarks[i].z);
    else instance.deathMarkVecs[i].set(9999, 9999);
  }
}

export function clearGrassDeathMarks(instance) {
  if (!instance) return;
  instance.deathMarks.length = 0;
  for (var i = 0; i < instance.maxDeathMarks; i++) instance.deathMarkVecs[i].set(9999, 9999);
}

export function addGrassDashImpulse(instance, x, z, dirX, dirZ) {
  if (!instance) return;
  instance.dashLife = 1;
  instance.dashPos.set(x, 0, z);
  instance.dashDir.set(dirX || 0, 0, dirZ || 1);
  if (instance.dashDir.lengthSq() < 0.001) instance.dashDir.set(0, 0, 1);
  instance.dashDir.normalize();
  addGrassFootstep(instance, x, z, 1.6);
}

export function disposeReactiveGrass(instance) {
  if (!instance) return;
  if (instance.root && instance.root.parent) instance.root.parent.remove(instance.root);
  if (instance.ground) {
    if (instance.ground.geometry) instance.ground.geometry.dispose();
    disposeMaterial(instance.ground.material);
  }
  if (instance.blades) {
    if (instance.blades.geometry) instance.blades.geometry.dispose();
    disposeMaterial(instance.blades.material);
  }
  if (instance.footprintsMesh) {
    if (instance.footprintsMesh.geometry) instance.footprintsMesh.geometry.dispose();
    disposeMaterial(instance.footprintsMesh.material);
  }
}
