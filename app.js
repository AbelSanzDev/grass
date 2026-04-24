import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  createReactiveGrass,
  attachReactiveGrass,
  updateReactiveGrass,
  disposeReactiveGrass,
  setReactiveGrassPlayerState,
  addGrassFootstep,
  addGrassDashImpulse,
  addGrassDeathMark,
  clearGrassDeathMarks,
  setGrassCrushPoints,
  clearGrassCrushPoints,
  setGrassCrushConfig,
  setGrassWindConfig
} from './reactiveGrass.js';

var QUALITY_PRESETS = {
  low: { bladeCount: 1400 },
  medium: { bladeCount: 4000 },
  high: { bladeCount: 8000 },
  premium: { bladeCount: 12000 }
};

var QUALITY_LEVELS = ['low', 'medium', 'high', 'premium'];
var quality = readInitialQuality();
var floorSize = 26;
var moveSpeed = 5.5;
var crushRadius = 1.05;
var crushStrength = 1.65;
var windStrength = 1.0;
var windAngle = 22;
var fanEnabled = false;
var fanPlaceMode = false;
var fanStrength = 1.35;
var fanRadius = 5.5;
var fanAngle = 8;
var fanPosition = new THREE.Vector2(-4, -2);
var autoPilot = true;
var crowdCrush = false;

var scene;
var camera;
var renderer;
var controls;
var clock;
var patchHost;
var grass;
var arenaRing;
var probe;
var probeVisual;
var fanVisual;
var fanConeVisual;
var probeHeading = new THREE.Vector3(0, 0, 1);
var probeTravel = 0;
var autoPhase = 0;
var lastFramePos = new THREE.Vector3();
var playerVelocity = new THREE.Vector3();
var manualMove = new THREE.Vector3();
var manualForward = new THREE.Vector3();
var manualRight = new THREE.Vector3();
var controlsTarget = new THREE.Vector3();
var upAxis = new THREE.Vector3(0, 1, 0);
var plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
var raycaster = new THREE.Raycaster();
var pointer = new THREE.Vector2();
var moveDirection = new THREE.Vector3();
var hitPoint = new THREE.Vector3();
var debugCrushMarkers = [];
var debugScorchMarkers = [];
var scorchCursor = 0;
var pressed = {};
var fpsSampleTimer = 0;
var fpsSampleFrames = 0;

var ui = {
  quality: document.getElementById('stat-quality'),
  blades: document.getElementById('stat-blades'),
  pos: document.getElementById('stat-pos'),
  fps: document.getElementById('stat-fps'),
  floorSize: document.getElementById('floor-size'),
  floorSizeValue: document.getElementById('floor-size-value'),
  moveSpeed: document.getElementById('move-speed'),
  moveSpeedValue: document.getElementById('move-speed-value'),
  crushRadius: document.getElementById('crush-radius'),
  crushRadiusValue: document.getElementById('crush-radius-value'),
  crushStrength: document.getElementById('crush-strength'),
  crushStrengthValue: document.getElementById('crush-strength-value'),
  windStrength: document.getElementById('wind-strength'),
  windStrengthValue: document.getElementById('wind-strength-value'),
  windAngle: document.getElementById('wind-angle'),
  windAngleValue: document.getElementById('wind-angle-value'),
  fanEnabled: document.getElementById('toggle-fan'),
  fanPlace: document.getElementById('btn-place-fan'),
  fanStrength: document.getElementById('fan-strength'),
  fanStrengthValue: document.getElementById('fan-strength-value'),
  fanRadius: document.getElementById('fan-radius'),
  fanRadiusValue: document.getElementById('fan-radius-value'),
  fanAngle: document.getElementById('fan-angle'),
  fanAngleValue: document.getElementById('fan-angle-value'),
  autoPilot: document.getElementById('toggle-autopilot'),
  crowd: document.getElementById('toggle-crowd'),
  qualityRow: document.getElementById('quality-row'),
  footstep: document.getElementById('btn-footstep'),
  dash: document.getElementById('btn-dash'),
  scorch: document.getElementById('btn-scorch'),
  clear: document.getElementById('btn-clear'),
  reset: document.getElementById('btn-reset')
};

boot();

function boot() {
  floorSize = Number(ui.floorSize.value) || floorSize;
  moveSpeed = Number(ui.moveSpeed.value) || moveSpeed;
  crushRadius = Number(ui.crushRadius.value) || crushRadius;
  crushStrength = Number(ui.crushStrength.value) || crushStrength;
  windStrength = Number(ui.windStrength.value) || windStrength;
  windAngle = Number(ui.windAngle.value) || windAngle;
  fanEnabled = !!ui.fanEnabled.checked;
  fanStrength = Number(ui.fanStrength.value) || fanStrength;
  fanRadius = Number(ui.fanRadius.value) || fanRadius;
  fanAngle = Number(ui.fanAngle.value) || fanAngle;
  autoPilot = !!ui.autoPilot.checked;
  crowdCrush = !!ui.crowd.checked;

  initThree();
  initProbe();
  initHelpers();
  bindUi();
  rebuildGrass();
  refreshUi();
  renderer.setAnimationLoop(tick);
}

function readInitialQuality() {
  try {
    var qp = new URLSearchParams(window.location.search).get('quality');
    if (QUALITY_LEVELS.indexOf(qp) >= 0) return qp;
  } catch (e) {}
  return 'premium';
}

function initThree() {
  var canvas = document.getElementById('stage');

  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  if (THREE.SRGBColorSpace !== undefined && renderer.outputColorSpace !== undefined) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x151a10);
  scene.fog = new THREE.FogExp2(0x151a10, 0.023);

  camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 120);
  camera.position.set(8.5, 7.4, 8.5);

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 4;
  controls.maxDistance = 28;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.target.set(0, 0.9, 0);
  controls.update();

  var ambient = new THREE.AmbientLight(0xb8c49b, 0.46);
  scene.add(ambient);

  var sun = new THREE.DirectionalLight(0xffe0a1, 3.15);
  sun.position.set(-6, 8.5, 3.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 30;
  sun.shadow.camera.left = -14;
  sun.shadow.camera.right = 14;
  sun.shadow.camera.top = 14;
  sun.shadow.camera.bottom = -14;
  scene.add(sun);

  var fill = new THREE.DirectionalLight(0x6f9857, 0.34);
  fill.position.set(6, 3.8, -5.5);
  scene.add(fill);

  var hemi = new THREE.HemisphereLight(0xa8c47d, 0x141008, 0.56);
  scene.add(hemi);

  var base = new THREE.Mesh(
    new THREE.CircleGeometry(30, 80),
    new THREE.MeshStandardMaterial({ color: 0x1a1d13, roughness: 1, metalness: 0 })
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.01;
  base.receiveShadow = true;
  scene.add(base);

  patchHost = new THREE.Group();
  scene.add(patchHost);

  arenaRing = new THREE.Mesh(
    new THREE.RingGeometry(12.7, 13.05, 80),
    new THREE.MeshBasicMaterial({
      color: 0xc5ef66,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide
    })
  );
  arenaRing.rotation.x = -Math.PI / 2;
  arenaRing.position.y = 0.022;
  scene.add(arenaRing);

  clock = new THREE.Clock();

  window.addEventListener('resize', onResize);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
}

function initProbe() {
  probe = new THREE.Object3D();
  probe.position.set(0, 0, 0);
  scene.add(probe);

  probeVisual = new THREE.Group();
  probe.add(probeVisual);

  var body = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 20, 20),
    new THREE.MeshStandardMaterial({
      color: 0xffc95d,
      emissive: 0x7b4c0d,
      roughness: 0.35,
      metalness: 0.05
    })
  );
  body.position.y = 0.3;
  body.castShadow = true;
  probeVisual.add(body);

  var arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.11, 0.3, 12),
    new THREE.MeshStandardMaterial({
      color: 0xff7a4f,
      emissive: 0x55200f,
      roughness: 0.45
    })
  );
  arrow.position.set(0, 0.3, 0.34);
  arrow.rotation.x = Math.PI * 0.5;
  arrow.castShadow = true;
  probeVisual.add(arrow);

  var shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  probeVisual.add(shadow);

  lastFramePos.copy(probe.position);
}

function initHelpers() {
  var crushGeo = new THREE.RingGeometry(0.18, 0.24, 20);
  var crushMat = new THREE.MeshBasicMaterial({
    color: 0x99d979,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide
  });

  for (var i = 0; i < 8; i++) {
    var crush = new THREE.Mesh(crushGeo, crushMat.clone());
    crush.rotation.x = -Math.PI / 2;
    crush.position.y = 0.03;
    crush.visible = false;
    scene.add(crush);
    debugCrushMarkers.push(crush);
  }

  var scorchGeo = new THREE.RingGeometry(0.3, 0.62, 28);
  var scorchMat = new THREE.MeshBasicMaterial({
    color: 0xff8a54,
    transparent: true,
    opacity: 0.46,
    side: THREE.DoubleSide
  });

  for (var j = 0; j < 10; j++) {
    var scorch = new THREE.Mesh(scorchGeo, scorchMat.clone());
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.y = 0.026;
    scorch.visible = false;
    scene.add(scorch);
    debugScorchMarkers.push(scorch);
  }

  initFanVisual();
}

function initFanVisual() {
  fanVisual = new THREE.Group();
  scene.add(fanVisual);

  var baseMat = new THREE.MeshStandardMaterial({
    color: 0x24322a,
    roughness: 0.72,
    metalness: 0.08
  });
  var accentMat = new THREE.MeshStandardMaterial({
    color: 0x9fe86b,
    emissive: 0x1f4a12,
    roughness: 0.48,
    metalness: 0.02
  });

  var base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.16, 18), baseMat);
  base.position.y = 0.08;
  base.castShadow = true;
  fanVisual.add(base);

  var body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.28, 0.42), baseMat);
  body.position.set(0, 0.34, 0);
  body.castShadow = true;
  fanVisual.add(body);

  var nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.42, 18), accentMat);
  nozzle.position.set(0, 0.34, 0.36);
  nozzle.rotation.x = Math.PI * 0.5;
  nozzle.castShadow = true;
  fanVisual.add(nozzle);

  fanConeVisual = new THREE.Mesh(
    new THREE.CircleGeometry(1, 36, -Math.PI * 0.22, Math.PI * 0.44),
    new THREE.MeshBasicMaterial({
      color: 0x9fe86b,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  fanConeVisual.rotation.x = -Math.PI / 2;
  fanConeVisual.position.y = 0.025;
  scene.add(fanConeVisual);
  updateFanVisual();
}

function bindUi() {
  ui.qualityRow.addEventListener('click', function (event) {
    var btn = event.target.closest('button[data-quality]');
    if (!btn) return;
    quality = btn.getAttribute('data-quality');
    rebuildGrass();
    refreshUi();
  });

  ui.floorSize.addEventListener('input', function () {
    floorSize = Number(ui.floorSize.value) || floorSize;
    ui.floorSizeValue.textContent = String(floorSize);
    rebuildGrass();
    refreshUi();
  });

  ui.moveSpeed.addEventListener('input', function () {
    moveSpeed = Number(ui.moveSpeed.value) || moveSpeed;
    ui.moveSpeedValue.textContent = moveSpeed.toFixed(1);
  });

  ui.crushRadius.addEventListener('input', function () {
    crushRadius = Number(ui.crushRadius.value) || crushRadius;
    ui.crushRadiusValue.textContent = crushRadius.toFixed(2);
    applyCrushConfig();
  });

  ui.crushStrength.addEventListener('input', function () {
    crushStrength = Number(ui.crushStrength.value);
    if (!isFinite(crushStrength)) crushStrength = 1.0;
    ui.crushStrengthValue.textContent = crushStrength.toFixed(2);
    applyCrushConfig();
  });

  ui.windStrength.addEventListener('input', function () {
    windStrength = Number(ui.windStrength.value);
    if (!isFinite(windStrength)) windStrength = 1.0;
    ui.windStrengthValue.textContent = windStrength.toFixed(2);
    applyWindConfig();
  });

  ui.windAngle.addEventListener('input', function () {
    windAngle = Number(ui.windAngle.value);
    if (!isFinite(windAngle)) windAngle = 0;
    ui.windAngleValue.textContent = Math.round(windAngle) + ' deg';
    applyWindConfig();
  });

  ui.fanEnabled.addEventListener('change', function () {
    fanEnabled = !!ui.fanEnabled.checked;
    fanPlaceMode = false;
    updateFanPlaceButton();
    applyWindConfig();
  });

  ui.fanPlace.addEventListener('click', function () {
    fanEnabled = true;
    ui.fanEnabled.checked = true;
    fanPlaceMode = !fanPlaceMode;
    updateFanPlaceButton();
    applyWindConfig();
  });

  ui.fanStrength.addEventListener('input', function () {
    fanStrength = Number(ui.fanStrength.value);
    if (!isFinite(fanStrength)) fanStrength = 1.35;
    ui.fanStrengthValue.textContent = fanStrength.toFixed(2);
    applyWindConfig();
  });

  ui.fanRadius.addEventListener('input', function () {
    fanRadius = Number(ui.fanRadius.value);
    if (!isFinite(fanRadius)) fanRadius = 5.5;
    ui.fanRadiusValue.textContent = fanRadius.toFixed(1);
    applyWindConfig();
  });

  ui.fanAngle.addEventListener('input', function () {
    fanAngle = Number(ui.fanAngle.value);
    if (!isFinite(fanAngle)) fanAngle = 0;
    ui.fanAngleValue.textContent = Math.round(fanAngle) + ' deg';
    applyWindConfig();
  });

  ui.autoPilot.addEventListener('change', function () {
    autoPilot = !!ui.autoPilot.checked;
    playerVelocity.set(0, 0, 0);
  });

  ui.crowd.addEventListener('change', function () {
    crowdCrush = !!ui.crowd.checked;
    if (!crowdCrush && grass) {
      clearGrassCrushPoints(grass);
      hideCrushMarkers();
    }
  });

  ui.footstep.addEventListener('click', function () {
    if (grass) addGrassFootstep(grass, probe.position.x, probe.position.z, 1.1);
  });

  ui.dash.addEventListener('click', triggerDash);
  ui.scorch.addEventListener('click', function () {
    placeScorch(probe.position.x, probe.position.z);
  });
  ui.clear.addEventListener('click', clearAllMarks);
  ui.reset.addEventListener('click', resetProbe);
}

function rebuildGrass() {
  clearAllMarks();
  if (grass) disposeReactiveGrass(grass);
  grass = createReactiveGrass({
    floorSize: floorSize,
    bladeCount: QUALITY_PRESETS[quality].bladeCount,
    playerRadius: crushRadius,
    crowdRadius: crushRadius,
    crushStrength: crushStrength,
    windDirection: directionFromAngle(windAngle),
    windStrength: windStrength,
    fanEnabled: fanEnabled,
    fanPosition: fanPosition,
    fanDirection: directionFromAngle(fanAngle),
    fanStrength: fanStrength,
    fanRadius: fanRadius
  });
  attachReactiveGrass(grass, patchHost);
  applyCrushConfig();
  applyWindConfig();
  updateArenaRing();
}

function updateArenaRing() {
  arenaRing.geometry.dispose();
  var inner = Math.max(2, floorSize * 0.5 - 0.28);
  arenaRing.geometry = new THREE.RingGeometry(inner, inner + 0.34, 96);
}

function clearAllMarks() {
  if (!grass) return;
  clearGrassDeathMarks(grass);
  clearGrassCrushPoints(grass);
  hideCrushMarkers();
  for (var i = 0; i < debugScorchMarkers.length; i++) debugScorchMarkers[i].visible = false;
  scorchCursor = 0;
}

function resetProbe() {
  probe.position.set(0, 0, 0);
  lastFramePos.copy(probe.position);
  playerVelocity.set(0, 0, 0);
  probeHeading.set(0, 0, 1);
  probeVisual.rotation.y = 0;
  autoPhase = 0;
  probeTravel = 0;
  controls.target.set(0, 0.9, 0);
}

function tick() {
  var dt = Math.min(clock.getDelta(), 0.05);
  updateProbe(dt);
  updateCrowdCrush();
  updateFanVisual();
  if (grass) {
    setReactiveGrassPlayerState(grass, probe.position, playerVelocity);
    updateReactiveGrass(grass, dt);
  }
  updateStats(dt);
  controlsTarget.set(probe.position.x, 0.7, probe.position.z);
  controls.target.lerp(controlsTarget, 0.08);
  controls.update();
  renderer.render(scene, camera);
}

function updateProbe(dt) {
  if (autoPilot) updateAutoPilot(dt);
  else updateManualProbe(dt);

  clampProbeToFloor();

  var deltaX = probe.position.x - lastFramePos.x;
  var deltaZ = probe.position.z - lastFramePos.z;
  var dist = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);
  if (dt > 0) playerVelocity.set(deltaX / dt, 0, deltaZ / dt);
  else playerVelocity.set(0, 0, 0);

  if (dist > 0.0001) {
    probeHeading.set(deltaX, 0, deltaZ).normalize();
    probeVisual.rotation.y = Math.atan2(probeHeading.x, probeHeading.z);
    probeTravel += dist;
    if (probeTravel >= 0.7 && grass) {
      addGrassFootstep(grass, probe.position.x, probe.position.z, Math.min(1.45, 0.55 + playerVelocity.length() / 7));
      probeTravel = 0;
    }
  } else {
    playerVelocity.multiplyScalar(0.84);
  }

  lastFramePos.copy(probe.position);
}

function updateAutoPilot(dt) {
  autoPhase += dt * (0.55 + moveSpeed * 0.09);
  var radiusX = floorSize * 0.24;
  var radiusZ = floorSize * 0.18;
  var x = Math.cos(autoPhase * 0.9) * radiusX + Math.sin(autoPhase * 0.33) * radiusX * 0.28;
  var z = Math.sin(autoPhase * 1.18) * radiusZ;
  probe.position.set(x, 0, z);
}

function updateManualProbe(dt) {
  manualMove.set(0, 0, 0);
  if (pressed.KeyW) manualMove.z += 1;
  if (pressed.KeyS) manualMove.z -= 1;
  if (pressed.KeyA) manualMove.x -= 1;
  if (pressed.KeyD) manualMove.x += 1;
  if (manualMove.lengthSq() === 0) return;

  camera.getWorldDirection(manualForward);
  manualForward.y = 0;
  if (manualForward.lengthSq() < 0.0001) manualForward.set(0, 0, -1);
  manualForward.normalize();
  manualRight.crossVectors(manualForward, upAxis).normalize();

  manualMove.normalize();
  moveDirection.copy(manualRight).multiplyScalar(manualMove.x);
  moveDirection.addScaledVector(manualForward, manualMove.z);
  if (moveDirection.lengthSq() > 0.0001) {
    moveDirection.normalize();
    probe.position.addScaledVector(moveDirection, moveSpeed * dt);
  }
}

function clampProbeToFloor() {
  var edge = floorSize * 0.5 - 0.9;
  probe.position.x = THREE.MathUtils.clamp(probe.position.x, -edge, edge);
  probe.position.z = THREE.MathUtils.clamp(probe.position.z, -edge, edge);
}

function triggerDash() {
  if (!grass) return;
  var dir = hitPoint;
  if (playerVelocity.lengthSq() > 0.03) dir.copy(playerVelocity).normalize();
  else dir.copy(probeHeading);
  addGrassDashImpulse(grass, probe.position.x, probe.position.z, dir.x, dir.z);
}

function updateCrowdCrush() {
  if (!grass || !crowdCrush) return;

  var points = [];
  var radius = 1.1;
  points.push({ x: probe.position.x, z: probe.position.z });
  for (var i = 0; i < 5; i++) {
    var angle = autoPhase * 0.9 + (i / 5) * Math.PI * 2;
    points.push({
      x: probe.position.x + Math.cos(angle) * radius,
      z: probe.position.z + Math.sin(angle) * radius
    });
  }
  setGrassCrushPoints(grass, points);
  showCrushMarkers(points);
}

function showCrushMarkers(points) {
  for (var i = 0; i < debugCrushMarkers.length; i++) {
    var marker = debugCrushMarkers[i];
    if (i < points.length) {
      marker.position.set(points[i].x, 0.03, points[i].z);
      marker.visible = true;
    } else {
      marker.visible = false;
    }
  }
}

function hideCrushMarkers() {
  for (var i = 0; i < debugCrushMarkers.length; i++) debugCrushMarkers[i].visible = false;
}

function placeScorch(x, z) {
  if (!grass) return;
  addGrassDeathMark(grass, x, z);
  var marker = debugScorchMarkers[scorchCursor % debugScorchMarkers.length];
  scorchCursor += 1;
  marker.position.set(x, 0.026, z);
  marker.rotation.z = Math.random() * Math.PI * 2;
  marker.visible = true;
}

function updateStats(dt) {
  fpsSampleTimer += dt;
  fpsSampleFrames += 1;
  if (fpsSampleTimer >= 0.25) {
    ui.fps.textContent = String(Math.round(fpsSampleFrames / fpsSampleTimer));
    fpsSampleTimer = 0;
    fpsSampleFrames = 0;
  }

  ui.quality.textContent = quality;
  ui.blades.textContent = grass ? String(grass.bladeCount) : '0';
  ui.pos.textContent = probe.position.x.toFixed(1) + ' / ' + probe.position.z.toFixed(1);
}

function refreshUi() {
  ui.floorSizeValue.textContent = String(floorSize);
  ui.moveSpeedValue.textContent = moveSpeed.toFixed(1);
  ui.crushRadiusValue.textContent = crushRadius.toFixed(2);
  ui.crushStrengthValue.textContent = crushStrength.toFixed(2);
  ui.windStrengthValue.textContent = windStrength.toFixed(2);
  ui.windAngleValue.textContent = Math.round(windAngle) + ' deg';
  ui.fanStrengthValue.textContent = fanStrength.toFixed(2);
  ui.fanRadiusValue.textContent = fanRadius.toFixed(1);
  ui.fanAngleValue.textContent = Math.round(fanAngle) + ' deg';
  updateFanPlaceButton();
  updateFanVisual();
  updateQualityButtons();
  updateStats(0);
}

function applyCrushConfig() {
  if (!grass) return;
  setGrassCrushConfig(grass, {
    playerRadius: crushRadius,
    crowdRadius: crushRadius,
    strength: crushStrength
  });
}

function applyWindConfig() {
  if (grass) {
    setGrassWindConfig(grass, {
      direction: directionFromAngle(windAngle),
      strength: windStrength,
      fanEnabled: fanEnabled,
      fanPosition: fanPosition,
      fanDirection: directionFromAngle(fanAngle),
      fanStrength: fanStrength,
      fanRadius: fanRadius
    });
  }
  updateFanVisual();
}

function directionFromAngle(degrees) {
  var r = THREE.MathUtils.degToRad(degrees);
  return new THREE.Vector2(Math.sin(r), Math.cos(r));
}

function updateFanVisual() {
  if (!fanVisual || !fanConeVisual) return;
  var dir = directionFromAngle(fanAngle);
  fanVisual.position.set(fanPosition.x, 0, fanPosition.y);
  fanVisual.rotation.y = Math.atan2(dir.x, dir.y);
  fanVisual.visible = fanEnabled;

  fanConeVisual.position.set(
    fanPosition.x + dir.x * fanRadius * 0.5,
    0.025,
    fanPosition.y + dir.y * fanRadius * 0.5
  );
  fanConeVisual.rotation.z = -Math.atan2(dir.x, dir.y);
  fanConeVisual.scale.set(fanRadius * 0.42, fanRadius, 1);
  fanConeVisual.visible = fanEnabled;
  fanConeVisual.material.opacity = fanPlaceMode ? 0.24 : 0.14;
}

function updateFanPlaceButton() {
  if (!ui.fanPlace) return;
  ui.fanPlace.classList.toggle('active', fanPlaceMode);
  ui.fanPlace.textContent = fanPlaceMode ? 'Click ground' : 'Place fan';
}

function updateQualityButtons() {
  var buttons = ui.qualityRow.querySelectorAll('button[data-quality]');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].classList.toggle('active', buttons[i].getAttribute('data-quality') === quality);
  }
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onPointerDown(event) {
  if (event.target !== renderer.domElement) return;
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  if (raycaster.ray.intersectPlane(plane, hitPoint)) {
    if (fanPlaceMode) {
      fanPosition.set(hitPoint.x, hitPoint.z);
      fanPlaceMode = false;
      updateFanPlaceButton();
      applyWindConfig();
      return;
    }
    probe.position.set(hitPoint.x, 0, hitPoint.z);
    clampProbeToFloor();
    lastFramePos.copy(probe.position);
    probeTravel = 0;
  }
}

function onKeyDown(event) {
  pressed[event.code] = true;
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') triggerDash();
  if (event.code === 'Digit1') setQualityAndRefresh('low');
  if (event.code === 'Digit2') setQualityAndRefresh('medium');
  if (event.code === 'Digit3') setQualityAndRefresh('high');
  if (event.code === 'Digit4') setQualityAndRefresh('premium');
}

function onKeyUp(event) {
  pressed[event.code] = false;
}

function setQualityAndRefresh(level) {
  quality = level;
  rebuildGrass();
  refreshUi();
}
