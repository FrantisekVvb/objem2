const SVG_NS = "http://www.w3.org/2000/svg";

const SUB = 10;
const DIAGRAM_WIDTH = 178;
const DIAGRAM_HEIGHT = 242;
const DEFAULT_CUBOID_ORIGIN = { x: 0.5, y: 220 };
let cuboidOrigin = { ...DEFAULT_CUBOID_ORIGIN };
// Rozteče z přesného SVG tvaru 1 cm³ krychle (ne z obrysu kvádru).
const FW = 29.8127;
const DD = 10.1873;
const FH = 29.8127;
// Přesné rozměry kvádru z dodaného SVG (popisky 4 cm, 3 cm, 3 cm).
// Tyto hodnoty jsou počty „velkých“ krychlí podél hran.
const EXACT_CUBOID = { widthDm: 4, depthDm: 3, heightDm: 3 };
const CM_CUBE_ORIGIN = { x: 20.5, y: 61 };
const MM_CUBE_ORIGIN = { x: 123.5, y: 50 };
const CUBOID_MIN_DM = 1;
const CUBOID_MAX_DM = 4;
const CUBOID_SEARCH_MAX_DM = 16;
const STACK_CONTENT_BOUNDS = { minX: 8, minY: 0, maxX: 172, maxY: 72 };
const CONTENT_LABEL_PADDING = 22;
const VIEWPORT_SAFETY = 0.92;
const MIN_FIT_SCALE = 0.75;
// Posun o (+1, −3, +1) krychle vyjde v této projekci na obrazovce jen o 1 px, takže na
// jedno místo padá víc buněk mřížky. Kandidáty v tomto okruhu považujeme za shodné.
const SNAP_TIE_TOLERANCE = 3;
const CONFETTI_COLORS = [
  "#059669",
  "#10b981",
  "#34d399",
  "#6ee7b7",
  "#047857",
  "#a7f3d0",
];

// Kvádrový drátěný model ve vašem SVG má přední hranu délky 116 (0.5 -> 116.5).
// Aby se do ní vešly přesně 4 velké krychle, musí být 1 „krychlová jednotka“ = 116 / 4 = 29.
const WIREFRAME_FRONT_EDGE = 116;
const TARGET_UNIT = WIREFRAME_FRONT_EDGE / EXACT_CUBOID.widthDm; // 29
// Škálujeme krychli tak, aby její „přední hrana“ (FW) měla přesně TARGET_UNIT.
const CUBE_SCALE_TO_WIREFRAME = TARGET_UNIT / FW;
// Pro skládání krychlí používáme přesné rozměry z tvaru krychle po škálování (ne z obrysu kvádru).
const CUBE_PROJ_WIDTH = FW * CUBE_SCALE_TO_WIREFRAME;
const CUBE_PROJ_HEIGHT = FH * CUBE_SCALE_TO_WIREFRAME;
const CUBE_PROJ_DEPTH = DD * CUBE_SCALE_TO_WIREFRAME;
// Mřížka kvádru musí odpovídat promítnuté velikosti krychle ve všech osách.
const WIREFRAME_UNIT = CUBE_PROJ_WIDTH;
const WIREFRAME_DEPTH_STEP = CUBE_PROJ_DEPTH;
const WIREFRAME_HEIGHT_STEP = CUBE_PROJ_HEIGHT;
const FREE_SURFACE_CUBOID = { widthDm: 10, depthDm: 6, heightDm: 4 };

const CUBE_TYPES = {
  cm3: {
    subSize: SUB,
    scale: CUBE_SCALE_TO_WIREFRAME,
    origin: CM_CUBE_ORIGIN,
    templateId: "cm-cube-shape",
    stackCenter: { x: 40.65, y: 41 },
    hit: { x: 18, y: 18, w: 46, h: 46 },
  },
  mm3: {
    subSize: 1,
    scale: CUBE_SCALE_TO_WIREFRAME,
    origin: MM_CUBE_ORIGIN,
    templateId: "mm-cube-shape",
    stackCenter: { x: 125.5, y: 48 },
    hit: { x: 118, y: 42, w: 14, h: 14 },
  },
};

let CUBOID = { ...EXACT_CUBOID };

const diagram = document.getElementById("diagram");
const diagramBg = document.getElementById("diagram-bg");
const diagramWrap = document.getElementById("diagram-wrap");
const stage = document.getElementById("stage");
const appRoot = document.getElementById("app-root");
const modeCuboidBtn = document.getElementById("mode-cuboid-btn");
const modeFreeBtn = document.getElementById("mode-free-btn");
const cuboidPanel = document.getElementById("cuboid-panel");
const freePanel = document.getElementById("free-panel");
const newCuboidBtn = document.getElementById("new-cuboid-btn");
const cuboidWidthInput = document.getElementById("cuboid-width");
const cuboidDepthInput = document.getElementById("cuboid-depth");
const cuboidHeightInput = document.getElementById("cuboid-height");
const volumeAnswerRow = document.getElementById("volume-answer-row");
const volumeFeedback = document.getElementById("volume-feedback");
const volumeValueInput = document.getElementById("volume-value");
const volumeUnitSelect = document.getElementById("volume-unit");
const verifyBtn = document.getElementById("verify-btn");
const volumeKeypadOverlay = document.getElementById("volume-keypad-overlay");
const volumeKeypadDisplay = document.getElementById("volume-keypad-display");
const volumeKeypadError = document.getElementById("volume-keypad-error");
const volumeKeypadConfirm = document.getElementById("volume-keypad-confirm");
const volumeKeypadCancel = document.getElementById("volume-keypad-cancel");
const volumeMathKeypad = document.getElementById("volume-math-keypad");
const content = document.getElementById("content");
const placedCubesLayer = document.getElementById("placed-cubes");
const cubeStack = document.getElementById("cube-stack");
const cuboidExact = document.getElementById("cuboid-exact");
const cuboidExactLabels = document.getElementById("cuboid-exact-labels");
const cuboidDynamic = document.getElementById("cuboid-dynamic");
const cuboidDynamicLabels = document.getElementById("cuboid-dynamic-labels");
const cuboidHiddenEdges = document.getElementById("cuboid-hidden-edges");
const cuboidFrontOverlay = document.getElementById("cuboid-front-overlay");
const labelLayer = document.getElementById("label-layer");
const staticLayer = document.getElementById("static-layer");

let dragState = null;
let cubeCounter = 0;
let isFreeSurfaceMode = false;
let celebrationTimer = null;
let volumeKeypadDraft = "";
let isVolumeKeypadOpen = false;
const occupancy = new Map();

function occupancyKey(sx, sy, sz) {
  return `${sx},${sy},${sz}`;
}

function getLocalPoint(clientX, clientY) {
  const point = diagram.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  return point.matrixTransform(content.getScreenCTM().inverse());
}

function parseTranslate(element) {
  const transform = element.getAttribute("transform") || "";
  const match = transform.match(/translate\(([-\d.]+)[,\s]+([-\d.]+)\)/);
  if (!match) {
    return { x: 0, y: 0 };
  }
  return { x: Number(match[1]), y: Number(match[2]) };
}

function subGridToScreen(sx, sy, sz) {
  return {
    // Hloubka (sy) jde doprava a nahoru – stejně jako ve vzorovém SVG se dvěma krychlemi.
    x: cuboidOrigin.x + (sx / SUB) * WIREFRAME_UNIT + (sy / SUB) * WIREFRAME_DEPTH_STEP,
    y: cuboidOrigin.y - (sz / SUB) * WIREFRAME_HEIGHT_STEP - (sy / SUB) * WIREFRAME_DEPTH_STEP,
  };
}

// Jednomu bodu na obrazovce odpovídá v projekci celý paprsek, takže inverz je jednoznačný
// až po zvolení patra. Pro dané sz je ale řešení přesné, což je základ přichytávání.
function screenToSubGridAtLevel(screenX, screenY, sz) {
  const localX = screenX - cuboidOrigin.x;
  const localY = screenY - cuboidOrigin.y;
  const sy = ((-localY - (sz / SUB) * WIREFRAME_HEIGHT_STEP) * SUB) / WIREFRAME_DEPTH_STEP;
  const sx = ((localX - (sy / SUB) * WIREFRAME_DEPTH_STEP) * SUB) / WIREFRAME_UNIT;
  return { sx, sy, sz };
}

function getCuboidSubSize() {
  return {
    width: CUBOID.widthDm * SUB,
    depth: CUBOID.depthDm * SUB,
    height: CUBOID.heightDm * SUB,
  };
}

function isInsideCuboid(sx, sy, sz, subSize) {
  const bounds = getCuboidSubSize();
  return (
    sx >= 0 &&
    sy >= 0 &&
    sz >= 0 &&
    sx + subSize <= bounds.width &&
    sy + subSize <= bounds.depth &&
    sz + subSize <= bounds.height
  );
}

function markOccupied(sx, sy, sz, subSize, id) {
  for (let dz = 0; dz < subSize; dz += 1) {
    for (let dy = 0; dy < subSize; dy += 1) {
      for (let dx = 0; dx < subSize; dx += 1) {
        occupancy.set(occupancyKey(sx + dx, sy + dy, sz + dz), id);
      }
    }
  }
}

function clearOccupied(id) {
  for (const [key, value] of occupancy.entries()) {
    if (value === id) {
      occupancy.delete(key);
    }
  }
}

function canPlaceAt(sx, sy, sz, subSize, excludeId) {
  if (!isInsideCuboid(sx, sy, sz, subSize)) {
    return false;
  }

  for (let dz = 0; dz < subSize; dz += 1) {
    for (let dy = 0; dy < subSize; dy += 1) {
      for (let dx = 0; dx < subSize; dx += 1) {
        const occupant = occupancy.get(occupancyKey(sx + dx, sy + dy, sz + dz));
        if (occupant !== undefined && occupant !== excludeId) {
          return false;
        }
      }
    }
  }

  return true;
}

// Vzdálenost ve směru pohledu. Menší hodnota = blíž k divákovi.
function getCellFarness(sx, sy, sz) {
  return (
    sy -
    (WIREFRAME_DEPTH_STEP / WIREFRAME_UNIT) * sx -
    (WIREFRAME_DEPTH_STEP / WIREFRAME_HEIGHT_STEP) * sz
  );
}

function hasSupportBelow(sx, sy, sz, subSize, excludeId) {
  if (sz === 0) {
    return true;
  }
  for (let dy = 0; dy < subSize; dy += 1) {
    for (let dx = 0; dx < subSize; dx += 1) {
      const occupant = occupancy.get(occupancyKey(sx + dx, sy + dy, sz - 1));
      if (occupant !== undefined && occupant !== excludeId) {
        return true;
      }
    }
  }
  return false;
}

// Vrátí buňku mřížky, do které krychle patří. Prochází patra, v každém dopočítá přesné
// sx/sy a okolí prověří jen kvůli obsazenosti.
function findNearestCell(anchorX, anchorY, subSize, excludeId) {
  const bounds = getCuboidSubSize();
  const candidates = [];
  let best = null;

  const consider = (sx, sy, sz) => {
    if (!canPlaceAt(sx, sy, sz, subSize, excludeId)) {
      return;
    }
    const screen = subGridToScreen(sx, sy, sz);
    const distance = Math.hypot(screen.x - anchorX, screen.y - anchorY);
    const candidate = { sx, sy, sz, distance, screen };
    if (!best || distance < best.distance) {
      best = candidate;
    }
    candidates.push(candidate);
  };

  for (let sz = 0; sz <= bounds.height - subSize; sz += subSize) {
    const exact = screenToSubGridAtLevel(anchorX, anchorY, sz);
    const baseX = Math.round(exact.sx / subSize) * subSize;
    const baseY = Math.round(exact.sy / subSize) * subSize;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        consider(baseX + dx * subSize, baseY + dy * subSize, sz);
      }
    }
  }

  if (!best) {
    return null;
  }

  // Buňky, které padnou prakticky na stejný pixel jako vítěz, leží na paprsku pod
  // kurzorem – z obrázku se mezi nimi vybrat nedá. Sousedy v řadě dělí 14 px, ty se sem
  // tedy nedostanou.
  const ray = candidates.filter(
    (cell) =>
      Math.hypot(cell.screen.x - best.screen.x, cell.screen.y - best.screen.y) <= SNAP_TIE_TOLERANCE,
  );
  // Vybíráme jako při stavění: krychle putuje po paprsku od diváka dozadu a zastaví se
  // na první ploše, na kterou má dosednout. Když cestou žádnou nepotká, opře se úplně
  // vzadu o stěnu kvádru. Rozhoduje jen poloha kurzoru, ne trasa, kudy se krychle vedla.
  ray.sort((a, b) => getCellFarness(a.sx, a.sy, a.sz) - getCellFarness(b.sx, b.sy, b.sz));
  const landing = ray.find((cell) =>
    hasSupportBelow(cell.sx, cell.sy, cell.sz, subSize, excludeId),
  );

  return landing || ray[ray.length - 1];
}

function getCuboidScreenBoundsForSize(widthDm, depthDm, heightDm) {
  const bounds = {
    width: widthDm * SUB,
    depth: depthDm * SUB,
    height: heightDm * SUB,
  };
  const xs = [];
  const ys = [];

  const corners = [
    { sx: 0, sy: 0, sz: 0 },
    { sx: bounds.width, sy: 0, sz: 0 },
    { sx: 0, sy: bounds.depth, sz: 0 },
    { sx: bounds.width, sy: bounds.depth, sz: 0 },
    { sx: 0, sy: 0, sz: bounds.height },
    { sx: bounds.width, sy: 0, sz: bounds.height },
    { sx: 0, sy: bounds.depth, sz: bounds.height },
    { sx: bounds.width, sy: bounds.depth, sz: bounds.height },
  ];

  corners.forEach((corner) => {
    const screen = subGridToScreen(corner.sx, corner.sy, corner.sz);
    xs.push(screen.x);
    ys.push(screen.y);
  });

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function getCuboidScreenBounds() {
  return getCuboidScreenBoundsForSize(CUBOID.widthDm, CUBOID.depthDm, CUBOID.heightDm);
}

function getContentBoundsForCuboidSize(widthDm, depthDm, heightDm) {
  const cuboid = getCuboidScreenBoundsForSize(widthDm, depthDm, heightDm);
  const stack = isFreeSurfaceMode ? getStackBounds() : STACK_CONTENT_BOUNDS;
  return {
    minX: Math.min(stack.minX, cuboid.minX - CONTENT_LABEL_PADDING),
    minY: Math.min(stack.minY, cuboid.minY - CONTENT_LABEL_PADDING),
    maxX: Math.max(stack.maxX, cuboid.maxX + CONTENT_LABEL_PADDING),
    maxY: Math.max(stack.maxY, cuboid.maxY + CONTENT_LABEL_PADDING),
  };
}

function getContentBounds() {
  return getContentBoundsForCuboidSize(CUBOID.widthDm, CUBOID.depthDm, CUBOID.heightDm);
}

function shouldSnapToCuboid(anchorX, anchorY) {
  // Snap jen pokud kurzor míří do projekce kvádru (mírná tolerance).
  const pad = 10;
  const bounds = getCuboidScreenBounds();
  return (
    anchorX >= bounds.minX - pad &&
    anchorX <= bounds.maxX + pad &&
    anchorY >= bounds.minY - pad &&
    anchorY <= bounds.maxY + pad
  );
}

// Pohled na mřížku míří šikmo tak, že vzdalování od kamery znamená doleva, dozadu a dolů.
// Blíž k divákovi je tedy krychle víc vpravo, víc vepředu a výš.
function getCubePaintBox(element) {
  const s = CUBE_TYPES[element.dataset.type].subSize;
  const sx = Number(element.dataset.sx) || 0;
  const sy = Number(element.dataset.sy) || 0;
  const sz = Number(element.dataset.sz) || 0;
  const u = WIREFRAME_UNIT / SUB;
  const d = WIREFRAME_DEPTH_STEP / SUB;
  const h = WIREFRAME_HEIGHT_STEP / SUB;

  // Průmět krychle je šestiúhelník se třemi směry hran, takže na přesný test překryvu
  // stačí porovnat rozsahy na osách x, y a x+y.
  return {
    sx,
    sy,
    sz,
    s,
    minX: sx * u + sy * d,
    maxX: (sx + s) * u + (sy + s) * d,
    minY: -(sz + s) * h - (sy + s) * d,
    maxY: -sz * h - sy * d,
    minS: sx * u - (sz + s) * h,
    maxS: (sx + s) * u - sz * h,
  };
}

function paintBoxesOverlap(a, b) {
  const e = 0.01;
  return (
    a.minX < b.maxX - e &&
    b.minX < a.maxX - e &&
    a.minY < b.maxY - e &&
    b.minY < a.maxY - e &&
    a.minS < b.maxS - e &&
    b.minS < a.maxS - e
  );
}

// Dvě krychle v mřížce se nikdy neprotínají, takže je vždy dělí některá z os. Ta osa
// pak jednoznačně říká, která je vzadu – a když se průměty opravdu překrývají, dají
// všechny dělící osy stejnou odpověď.
function isCubeBehind(a, b) {
  return a.sx + a.s <= b.sx || a.sy >= b.sy + b.s || a.sz + a.s <= b.sz;
}

function sortPlacedCubes() {
  const items = [...placedCubesLayer.querySelectorAll(".placed-cube")].map((element) => ({
    element,
    box: getCubePaintBox(element),
  }));

  // Hrubé předřazení podle vzdálenosti ve směru pohledu drží výsledek stabilní.
  const xRatio = WIREFRAME_DEPTH_STEP / WIREFRAME_UNIT;
  const zRatio = WIREFRAME_DEPTH_STEP / WIREFRAME_HEIGHT_STEP;
  const farness = (box) => box.sy - xRatio * box.sx - zRatio * box.sz;
  items.sort((p, q) => farness(q.box) - farness(p.box) || p.box.sx - q.box.sx);

  // Malířův algoritmus: krychli vykreslíme až po všech, které jsou za ní a překrývají ji.
  const state = new Array(items.length).fill(0);
  const ordered = [];
  const visit = (i) => {
    if (state[i]) {
      return;
    }
    state[i] = 1;
    for (let j = 0; j < items.length; j += 1) {
      if (j === i || state[j] || !paintBoxesOverlap(items[i].box, items[j].box)) {
        continue;
      }
      if (isCubeBehind(items[j].box, items[i].box)) {
        visit(j);
      }
    }
    state[i] = 2;
    ordered.push(items[i].element);
  };
  for (let i = 0; i < items.length; i += 1) {
    visit(i);
  }

  placedCubesLayer.replaceChildren(...ordered);
}

function getCubeProjectionSize(cells) {
  return {
    w: CUBE_PROJ_WIDTH * cells,
    h: CUBE_PROJ_HEIGHT * cells,
    d: CUBE_PROJ_DEPTH * cells,
  };
}

function getCubePickRects(cube) {
  const def = CUBE_TYPES[cube.dataset.type];
  const cells = def.subSize / SUB;
  const anchor = getCubeScreenAnchor(cube);
  const { w, h, d } = getCubeProjectionSize(cells);

  return [
    { x: anchor.x, y: anchor.y - h, w, h },
    { x: anchor.x, y: anchor.y - h - d, w: w + d, h: d },
    { x: anchor.x + w, y: anchor.y - h - d, w: d, h: h + d },
  ];
}

function isPointInAnyRect(px, py, rects) {
  return rects.some((rect) => isPointInRect(px, py, rect));
}

function isPointInRect(px, py, rect) {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

function pickTopmostCubeAt(localX, localY) {
  const candidates = [];
  placedCubesLayer.querySelectorAll(".placed-cube").forEach((cube) => {
    if (isPointInAnyRect(localX, localY, getCubePickRects(cube))) {
      candidates.push(cube);
    }
  });

  if (!candidates.length) {
    return null;
  }

  // Vyber "nejvíc navrchu" podle skutečné obrazovky, ne podle zastaralých grid souřadnic.
  candidates.sort((a, b) => {
    const aAnchor = getCubeScreenAnchor(a);
    const bAnchor = getCubeScreenAnchor(b);
    if (aAnchor.y !== bAnchor.y) return aAnchor.y - bAnchor.y;
    if (aAnchor.x !== bAnchor.x) return bAnchor.x - aAnchor.x;
    return Number(b.dataset.id) - Number(a.dataset.id);
  });

  return candidates[candidates.length - 1];
}

function pickPlacedCubeFromEvent(event) {
  const hit = event.target.closest(".placed-cube");
  if (hit && placedCubesLayer.contains(hit)) {
    return hit;
  }

  const point = getLocalPoint(event.clientX, event.clientY);
  return pickTopmostCubeAt(point.x, point.y);
}

function cloneCubeShape(type) {
  const def = CUBE_TYPES[type];
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `#${def.templateId}`);
  return use;
}

function getCubeScreenAnchor(element) {
  const def = CUBE_TYPES[element.dataset.type];
  const position = parseTranslate(element);
  return {
    x: position.x + def.origin.x * def.scale,
    y: position.y + def.origin.y * def.scale,
  };
}

function setCubeScreenAnchor(element, anchorX, anchorY) {
  const def = CUBE_TYPES[element.dataset.type];
  element.setAttribute(
    "transform",
    `translate(${anchorX - def.origin.x * def.scale}, ${anchorY - def.origin.y * def.scale})`,
  );
  // Takhle leží krychle jen během tahu mimo kvádr. I tak jí souřadnice pro řazení
  // dopočítáme z pozice na plátně, aby si nenesla ty z posledního přichycení.
  const equivalent = screenToSubGridAtLevel(anchorX, anchorY, 0);
  element.dataset.sx = String(equivalent.sx);
  element.dataset.sy = String(equivalent.sy);
  element.dataset.sz = "0";
  element.dataset.snapped = "0";
}
function cubeTransformForGrid(type, sx, sy, sz) {
  const def = CUBE_TYPES[type];
  const anchor = subGridToScreen(sx, sy, sz);
  return `translate(${anchor.x - def.origin.x * def.scale}, ${anchor.y - def.origin.y * def.scale})`;
}

function setCubeGridPosition(element, sx, sy, sz) {
  element.dataset.sx = String(sx);
  element.dataset.sy = String(sy);
  element.dataset.sz = String(sz);
  element.dataset.snapped = "1";
  element.setAttribute("transform", cubeTransformForGrid(element.dataset.type, sx, sy, sz));
}

function createPlacedCubeHitArea(type) {
  const def = CUBE_TYPES[type];
  const cells = def.subSize / SUB;
  const { w, h, d } = getCubeProjectionSize(cells);
  const originX = def.origin.x * def.scale;
  const originY = def.origin.y * def.scale;
  const hit = document.createElementNS(SVG_NS, "path");
  const front = `M${originX} ${originY}V${originY - h}H${originX + w}V${originY}Z`;
  const top = `M${originX} ${originY - h}H${originX + w + d}V${originY - h - d}H${originX}Z`;
  const side = `M${originX + w} ${originY}V${originY - h - d}H${originX + w + d}V${originY - d}Z`;
  hit.setAttribute("d", `${front} ${top} ${side}`);
  hit.setAttribute("fill", "transparent");
  hit.setAttribute("stroke", "none");
  hit.classList.add("cube-hit");
  return hit;
}

function createPlacedCube(type, sx, sy, sz) {
  const def = CUBE_TYPES[type];
  const group = document.createElementNS(SVG_NS, "g");
  const id = String(++cubeCounter);
  group.classList.add("placed-cube");
  group.dataset.type = type;
  group.dataset.id = id;
  const visual = document.createElementNS(SVG_NS, "g");
  visual.setAttribute("transform", `scale(${def.scale})`);
  visual.appendChild(cloneCubeShape(type));
  group.appendChild(visual);
  group.appendChild(createPlacedCubeHitArea(type));

  placedCubesLayer.appendChild(group);
  setCubeGridPosition(group, sx, sy, sz);
  markOccupied(sx, sy, sz, def.subSize, id);
  sortPlacedCubes();
  return group;
}

function bringToFront(element) {
  placedCubesLayer.appendChild(element);
}

function getStackTransformOffset() {
  return parseTranslate(cubeStack);
}

function startDragFromStack(type, localX, localY) {
  const def = CUBE_TYPES[type];
  const cube = createPlacedCube(type, 0, 0, 0);
  clearOccupied(cube.dataset.id);
  const stackOffset = getStackTransformOffset();
  const stackX = def.origin.x * def.scale + stackOffset.x;
  const stackY = (def.origin.y + (type === "cm3" ? -5 : 0)) * def.scale + stackOffset.y;
  setCubeScreenAnchor(cube, stackX, stackY);
  bringToFront(cube);
  placedCubesLayer.classList.add("is-dragging");
  diagram.classList.add("is-dragging");

  dragState = {
    element: cube,
    offsetX: localX - stackX,
    offsetY: localY - stackY,
    pointerId: null,
  };
}

function startDragPlacedCube(element, localX, localY) {
  clearOccupied(element.dataset.id);
  const anchor = getCubeScreenAnchor(element);
  bringToFront(element);
  element.classList.add("is-dragging");
  placedCubesLayer.classList.add("is-dragging");
  diagram.classList.add("is-dragging");

  dragState = {
    element,
    offsetX: localX - anchor.x,
    offsetY: localY - anchor.y,
    pointerId: null,
  };
}

function updateDrag(localX, localY) {
  if (!dragState) {
    return;
  }

  const anchorX = localX - dragState.offsetX;
  const anchorY = localY - dragState.offsetY;
  const def = CUBE_TYPES[dragState.element.dataset.type];
  const excludeId = dragState.element.dataset.id;

  // Nad kvádrem se krychle drží mřížky, mimo něj volně sleduje kurzor a při puštění
  // se vrátí do zásobníku.
  const cell = shouldSnapToCuboid(anchorX, anchorY)
    ? findNearestCell(anchorX, anchorY, def.subSize, excludeId)
    : null;

  if (cell) {
    setCubeGridPosition(dragState.element, cell.sx, cell.sy, cell.sz);
  } else {
    setCubeScreenAnchor(dragState.element, anchorX, anchorY);
  }

  bringToFront(dragState.element);
}

function endDrag() {
  if (!dragState) {
    return;
  }

  const { element } = dragState;
  const def = CUBE_TYPES[element.dataset.type];
  const id = element.dataset.id;
  const anchor = getCubeScreenAnchor(element);

  const cell = shouldSnapToCuboid(anchor.x, anchor.y)
    ? findNearestCell(anchor.x, anchor.y, def.subSize, id)
    : null;

  element.classList.remove("is-dragging");
  placedCubesLayer.classList.remove("is-dragging");
  diagram.classList.remove("is-dragging");
  dragState = null;

  // Krychle existuje jen v mřížce. Puštěná mimo kvádr se vrací do zásobníku.
  if (!cell) {
    clearOccupied(id);
    element.remove();
    sortPlacedCubes();
    return;
  }

  setCubeGridPosition(element, cell.sx, cell.sy, cell.sz);
  markOccupied(cell.sx, cell.sy, cell.sz, def.subSize, id);
  sortPlacedCubes();
}

placedCubesLayer.addEventListener("pointerdown", (event) => {
  const placedCube = pickPlacedCubeFromEvent(event);
  if (!placedCube) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  const point = getLocalPoint(event.clientX, event.clientY);
  startDragPlacedCube(placedCube, point.x, point.y);
  dragState.pointerId = event.pointerId;
  diagram.setPointerCapture(event.pointerId);
});

diagram.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".placed-cube")) {
    return;
  }

  const stackCube = event.target.closest(".stack-cube");
  if (!stackCube) {
    return;
  }

  event.preventDefault();
  const point = getLocalPoint(event.clientX, event.clientY);
  const type = stackCube.dataset.type;
  startDragFromStack(type, point.x, point.y);
  dragState.pointerId = event.pointerId;
  diagram.setPointerCapture(event.pointerId);
});

diagram.addEventListener("pointermove", (event) => {
  if (!dragState || dragState.pointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();
  const point = getLocalPoint(event.clientX, event.clientY);
  updateDrag(point.x, point.y);
});

function finishPointer(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) {
    return;
  }

  if (diagram.hasPointerCapture(event.pointerId)) {
    diagram.releasePointerCapture(event.pointerId);
  }
  endDrag();
}

diagram.addEventListener("pointerup", finishPointer);
diagram.addEventListener("pointercancel", finishPointer);

function createLine(x1, y1, x2, y2, options = {}) {
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", String(x1));
  line.setAttribute("y1", String(y1));
  line.setAttribute("x2", String(x2));
  line.setAttribute("y2", String(y2));
  line.setAttribute("stroke", options.stroke || "#A4A4A4");
  if (options.dash) {
    line.setAttribute("stroke-dasharray", "2 2");
  }
  return line;
}

function createLabel(text, x, y, anchor = "middle") {
  const label = document.createElementNS(SVG_NS, "text");
  label.textContent = text;
  label.setAttribute("x", String(x));
  label.setAttribute("y", String(y));
  label.setAttribute("text-anchor", anchor);
  label.setAttribute("fill", "black");
  label.setAttribute("font-size", "10");
  label.setAttribute("font-family", "Fenomen Sans, ui-sans-serif, system-ui, sans-serif");
  label.setAttribute("font-weight", "500");
  return label;
}

function edgeMidpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function offsetFromEdge(a, b, distance, side = 1) {
  const mid = edgeMidpoint(a, b);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: mid.x + (-dy / len) * distance * side,
    y: mid.y + (dx / len) * distance * side,
  };
}

function createDimensionLabel(cm, x, y, anchor = "middle") {
  return createLabel(`${cm} cm`, x, y, anchor);
}

function isExactCuboidSize(widthDm, depthDm, heightDm) {
  return (
    widthDm === EXACT_CUBOID.widthDm &&
    depthDm === EXACT_CUBOID.depthDm &&
    heightDm === EXACT_CUBOID.heightDm
  );
}

function getAvailableDiagramSize() {
  const stageRect = stage.getBoundingClientRect();
  return {
    width: Math.max(200, stageRect.width),
    height: Math.max(200, stageRect.height),
  };
}

function getFitScaleForCuboidSize(widthDm, depthDm, heightDm) {
  const bounds = getContentBoundsForCuboidSize(widthDm, depthDm, heightDm);
  const contentWidth = bounds.maxX - bounds.minX;
  const contentHeight = bounds.maxY - bounds.minY;
  const available = getAvailableDiagramSize();

  return Math.min(
    (available.width * VIEWPORT_SAFETY) / contentWidth,
    (available.height * VIEWPORT_SAFETY) / contentHeight,
  );
}

function getFitScale() {
  const available = getAvailableDiagramSize();
  return Math.min(
    (available.width * VIEWPORT_SAFETY) / DIAGRAM_WIDTH,
    (available.height * VIEWPORT_SAFETY) / DIAGRAM_HEIGHT,
  );
}

function getMaxCuboidDm() {
  let widthDm = CUBOID_MIN_DM;
  let depthDm = CUBOID_MIN_DM;
  let heightDm = CUBOID_MIN_DM;

  for (let candidate = CUBOID_MIN_DM; candidate <= CUBOID_SEARCH_MAX_DM; candidate += 1) {
    if (getFitScaleForCuboidSize(candidate, depthDm, heightDm) >= MIN_FIT_SCALE) {
      widthDm = candidate;
    } else {
      break;
    }
  }

  for (let candidate = CUBOID_MIN_DM; candidate <= CUBOID_SEARCH_MAX_DM; candidate += 1) {
    if (getFitScaleForCuboidSize(widthDm, candidate, heightDm) >= MIN_FIT_SCALE) {
      depthDm = candidate;
    } else {
      break;
    }
  }

  for (let candidate = CUBOID_MIN_DM; candidate <= CUBOID_SEARCH_MAX_DM; candidate += 1) {
    if (getFitScaleForCuboidSize(widthDm, depthDm, candidate) >= MIN_FIT_SCALE) {
      heightDm = candidate;
    } else {
      break;
    }
  }

  return {
    widthDm: Math.min(widthDm, CUBOID_MAX_DM),
    depthDm: Math.min(depthDm, CUBOID_MAX_DM),
    heightDm: Math.min(heightDm, CUBOID_MAX_DM),
  };
}

function clampCuboidSize(widthDm, depthDm, heightDm) {
  const max = getMaxCuboidDm();
  // Hrany kvádru musí být násobky hrany větší krychle (1 cm).
  widthDm = Math.round(widthDm);
  depthDm = Math.round(depthDm);
  heightDm = Math.round(heightDm);
  return {
    widthDm: Math.max(CUBOID_MIN_DM, Math.min(widthDm, max.widthDm)),
    depthDm: Math.max(CUBOID_MIN_DM, Math.min(depthDm, max.depthDm)),
    heightDm: Math.max(CUBOID_MIN_DM, Math.min(heightDm, max.heightDm)),
  };
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function clearPlacedCubes() {
  placedCubesLayer.replaceChildren();
  occupancy.clear();
}

function updateToolbarModeState() {
  modeCuboidBtn.classList.toggle("is-active", !isFreeSurfaceMode);
  modeFreeBtn.classList.toggle("is-active", isFreeSurfaceMode);
  modeCuboidBtn.setAttribute("aria-selected", String(!isFreeSurfaceMode));
  modeFreeBtn.setAttribute("aria-selected", String(isFreeSurfaceMode));
  appRoot.dataset.appMode = isFreeSurfaceMode ? "free" : "cuboid";
  cuboidPanel.hidden = isFreeSurfaceMode;
  freePanel.hidden = !isFreeSurfaceMode;
}

function getStackLocalBounds() {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  cubeStack.querySelectorAll(".stack-cube").forEach((stackCube) => {
    const box = stackCube.getBBox();
    minX = Math.min(minX, box.x);
    maxX = Math.max(maxX, box.x + box.width);
    minY = Math.min(minY, box.y);
    maxY = Math.max(maxY, box.y + box.height);
  });

  if (!Number.isFinite(minX)) {
    return { ...STACK_CONTENT_BOUNDS };
  }

  return { minX, minY, maxX, maxY };
}

function getStackBounds() {
  const bbox = cubeStack.getBBox();
  return {
    minX: bbox.x,
    minY: bbox.y,
    maxX: bbox.x + bbox.width,
    maxY: bbox.y + bbox.height,
  };
}

function resetStackPosition() {
  cubeStack.removeAttribute("transform");
}

function resetCuboidOrigin() {
  cuboidOrigin = { ...DEFAULT_CUBOID_ORIGIN };
}

function centerFreeSurfaceLayoutHorizontally() {
  resetCuboidOrigin();
  resetStackPosition();

  const cuboidBounds = getCuboidScreenBounds();
  const stackBounds = getStackLocalBounds();
  const targetCenterX = (
    Math.min(cuboidBounds.minX, stackBounds.minX) +
    Math.max(cuboidBounds.maxX, stackBounds.maxX)
  ) / 2;

  cuboidOrigin.x += targetCenterX - (cuboidBounds.minX + cuboidBounds.maxX) / 2;

  const stackBoundsAfterCuboidShift = getStackLocalBounds();
  const stackOffsetX = targetCenterX - (stackBoundsAfterCuboidShift.minX + stackBoundsAfterCuboidShift.maxX) / 2;
  if (Math.abs(stackOffsetX) > 0.01) {
    cubeStack.setAttribute("transform", `translate(${stackOffsetX}, 0)`);
  }
}

function updateViewBox() {
  const available = getAvailableDiagramSize();

  if (isFreeSurfaceMode) {
    const bounds = getContentBounds();
    const contentW = bounds.maxX - bounds.minX;
    const contentH = bounds.maxY - bounds.minY;
    // Stejné měřítko jako v módu kvádr – krychle mají na obrazovce stejnou velikost,
    // i když je volná plocha větší (případně se plocha posouvá).
    const fitScale = getFitScale();
    const displayWidth = contentW * fitScale;
    const displayHeight = contentH * fitScale;

    diagram.setAttribute("viewBox", `${bounds.minX} ${bounds.minY} ${contentW} ${contentH}`);
    diagram.setAttribute("preserveAspectRatio", "xMidYMid meet");
    diagram.style.width = `${displayWidth}px`;
    diagram.style.height = `${displayHeight}px`;
    diagramBg.setAttribute("x", String(bounds.minX));
    diagramBg.setAttribute("y", String(bounds.minY));
    diagramBg.setAttribute("width", String(contentW));
    diagramBg.setAttribute("height", String(contentH));
    diagramWrap.style.width = `${displayWidth}px`;
    diagramWrap.style.height = `${displayHeight}px`;
    return;
  }

  const fitScale = Math.min(
    (available.width * VIEWPORT_SAFETY) / DIAGRAM_WIDTH,
    (available.height * VIEWPORT_SAFETY) / DIAGRAM_HEIGHT,
  );
  const displayWidth = DIAGRAM_WIDTH * fitScale;
  const displayHeight = DIAGRAM_HEIGHT * fitScale;

  diagram.setAttribute("viewBox", `0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}`);
  diagram.setAttribute("preserveAspectRatio", "xMidYMid meet");
  diagram.style.width = `${displayWidth}px`;
  diagram.style.height = `${displayHeight}px`;
  diagramBg.setAttribute("x", "0");
  diagramBg.setAttribute("y", "0");
  diagramBg.setAttribute("width", String(DIAGRAM_WIDTH));
  diagramBg.setAttribute("height", String(DIAGRAM_HEIGHT));
  diagramWrap.style.width = `${displayWidth}px`;
  diagramWrap.style.height = `${displayHeight}px`;
}

function setStaticLayerVisible(visible) {
  staticLayer.style.visibility = visible ? "visible" : "hidden";
  labelLayer.style.visibility = visible ? "visible" : "hidden";
}

function isFreeSurfaceCuboid(widthDm, depthDm, heightDm) {
  return (
    widthDm === FREE_SURFACE_CUBOID.widthDm &&
    depthDm === FREE_SURFACE_CUBOID.depthDm &&
    heightDm === FREE_SURFACE_CUBOID.heightDm
  );
}

function applyFreeSurfaceCuboid() {
  CUBOID = { ...FREE_SURFACE_CUBOID };
  centerFreeSurfaceLayoutHorizontally();
  clearPlacedCubes();
  resetVolumeQuiz();
  renderCuboidWireframe();
}

function initStackCubeScales() {
  cubeStack.querySelectorAll(".stack-cube").forEach((stackCube) => {
    const type = stackCube.dataset.type;
    const scale = CUBE_TYPES[type].scale;
    const use = stackCube.querySelector("use");
    if (!use) {
      return;
    }

    if (type === "cm3") {
      use.setAttribute("transform", `translate(0 -5) scale(${scale})`);
    } else {
      use.setAttribute("transform", `scale(${scale})`);
    }
  });
}
function applyCuboidDimensions(widthDm, depthDm, heightDm, { clamp = true } = {}) {
  CUBOID = clamp
    ? clampCuboidSize(widthDm, depthDm, heightDm)
    : {
        widthDm: Math.round(widthDm),
        depthDm: Math.round(depthDm),
        heightDm: Math.round(heightDm),
      };
  clearPlacedCubes();
  resetVolumeQuiz();
  renderCuboidWireframe();
  updateCuboidSizeInputs();
}

function enterFreeSurfaceMode() {
  if (isFreeSurfaceMode) {
    return;
  }

  isFreeSurfaceMode = true;
  setStaticLayerVisible(true);
  updateToolbarModeState();
  applyFreeSurfaceCuboid();
  updateViewBox();
}

function exitFreeSurfaceMode() {
  if (!isFreeSurfaceMode) {
    return;
  }

  isFreeSurfaceMode = false;
  resetCuboidOrigin();
  resetStackPosition();
  setStaticLayerVisible(true);
  updateToolbarModeState();
  renderCuboidWireframe();
}

function cornerSubGrid(gx, gy, gz) {
  return subGridToScreen(gx * SUB, gy * SUB, gz * SUB);
}

function getCuboidCornerPoints() {
  const { widthDm, depthDm, heightDm } = CUBOID;
  return {
    p000: cornerSubGrid(0, 0, 0),
    p100: cornerSubGrid(widthDm, 0, 0),
    p010: cornerSubGrid(0, depthDm, 0),
    p110: cornerSubGrid(widthDm, depthDm, 0),
    p001: cornerSubGrid(0, 0, heightDm),
    p101: cornerSubGrid(widthDm, 0, heightDm),
    p011: cornerSubGrid(0, depthDm, heightDm),
    p111: cornerSubGrid(widthDm, depthDm, heightDm),
    widthDm,
    depthDm,
    heightDm,
  };
}

function getCuboidVisibleEdges(points) {
  const { p000, p100, p010, p110, p001, p101, p011, p111 } = points;
  return [
    [p000, p100],
    [p100, p110],
    [p001, p101],
    [p101, p111],
    [p111, p011],
    [p011, p001],
    [p000, p001],
    [p100, p101],
    [p110, p111],
  ];
}

function getCuboidHiddenEdges(points) {
  const { p000, p010, p011, p110 } = points;
  return [
    [p010, p011],
    [p010, p000],
    [p110, p010],
  ];
}

function renderHiddenEdges() {
  cuboidHiddenEdges.replaceChildren();
  const points = getCuboidCornerPoints();

  getCuboidHiddenEdges(points).forEach(([a, b]) => {
    cuboidHiddenEdges.appendChild(createLine(a.x, a.y, b.x, b.y, { dash: true }));
  });
}

function renderFrontOverlay() {
  cuboidFrontOverlay.replaceChildren();
  const points = getCuboidCornerPoints();

  getCuboidVisibleEdges(points).forEach(([a, b]) => {
    cuboidFrontOverlay.appendChild(createLine(a.x, a.y, b.x, b.y));
  });
}

function renderDynamicCuboidLabels(points) {
  const { widthDm, depthDm, heightDm, p000, p100, p101, p110, p111 } = points;
  cuboidDynamicLabels.replaceChildren();

  const widthPos = offsetFromEdge(p000, p100, 14);
  const depthPos = offsetFromEdge(p100, p110, 12);
  const heightPos = offsetFromEdge(p110, p111, 12);

  cuboidDynamicLabels.appendChild(createDimensionLabel(widthDm, widthPos.x, widthPos.y));
  cuboidDynamicLabels.appendChild(createDimensionLabel(depthDm, depthPos.x, depthPos.y, "start"));
  cuboidDynamicLabels.appendChild(createDimensionLabel(heightDm, heightPos.x, heightPos.y, "start"));
}

function renderDynamicCuboid() {
  const points = getCuboidCornerPoints();
  renderDynamicCuboidLabels(points);
}

function setCuboidLayerVisibility(useExact) {
  cuboidExact.hidden = !useExact;
  cuboidDynamic.hidden = useExact;
  cuboidExactLabels.style.display = useExact ? "inline" : "none";
  cuboidDynamicLabels.style.display = useExact ? "none" : "inline";
}

function updateCuboidPresentation() {
  const showCuboidChrome = !isFreeSurfaceMode;
  cuboidHiddenEdges.style.visibility = showCuboidChrome ? "visible" : "hidden";
  cuboidFrontOverlay.style.visibility = showCuboidChrome ? "visible" : "hidden";
  cuboidExact.style.visibility = showCuboidChrome ? "visible" : "hidden";
  cuboidDynamic.style.visibility = showCuboidChrome ? "visible" : "hidden";
  cuboidExactLabels.style.visibility = showCuboidChrome ? "visible" : "hidden";
  cuboidDynamicLabels.style.visibility = showCuboidChrome ? "visible" : "hidden";
}

function renderCuboidWireframe() {
  const { widthDm, depthDm, heightDm } = CUBOID;
  const useExact = isExactCuboidSize(widthDm, depthDm, heightDm);

  setCuboidLayerVisibility(useExact);
  cuboidExact.replaceChildren();

  if (!useExact) {
    renderDynamicCuboid();
  } else {
    cuboidDynamicLabels.replaceChildren();
  }

  renderHiddenEdges();
  renderFrontOverlay();
  updateCuboidPresentation();
  updateViewBox();
}

function updateCuboidSizeInputs() {
  const max = getMaxCuboidDm();
  const inputs = [
    { element: cuboidWidthInput, max: max.widthDm },
    { element: cuboidDepthInput, max: max.depthDm },
    { element: cuboidHeightInput, max: max.heightDm },
  ];

  inputs.forEach(({ element, max: maxValue }) => {
    element.min = String(CUBOID_MIN_DM);
    element.max = String(maxValue);
  });

  cuboidWidthInput.value = String(CUBOID.widthDm);
  cuboidDepthInput.value = String(CUBOID.depthDm);
  cuboidHeightInput.value = String(CUBOID.heightDm);
  updateCuboidDimStepButtonsAll();
}

function updateCuboidDimStepButtons(input) {
  const container = input.closest(".step-input");
  if (!container) {
    return;
  }

  const min = Number(input.min);
  const max = Number(input.max);
  const current = Number(input.value);
  const value = Number.isFinite(current) ? current : min;

  container.querySelector(".step-up").disabled = value >= max;
  container.querySelector(".step-down").disabled = value <= min;
}

function updateCuboidDimStepButtonsAll() {
  updateCuboidDimStepButtons(cuboidWidthInput);
  updateCuboidDimStepButtons(cuboidDepthInput);
  updateCuboidDimStepButtons(cuboidHeightInput);
}

function stepCuboidDim(input, delta) {
  const min = Number(input.min);
  const max = Number(input.max);
  const current = Number(input.value);
  const base = Number.isFinite(current) ? current : min;
  input.value = String(Math.min(max, Math.max(min, base + delta)));
  updateCuboidDimStepButtons(input);
  applyCuboidSizeFromInputs();
}

function applyCuboidSizeFromInputs() {
  const width = Number(cuboidWidthInput.value);
  const depth = Number(cuboidDepthInput.value);
  const height = Number(cuboidHeightInput.value);

  if (!Number.isFinite(width) || !Number.isFinite(depth) || !Number.isFinite(height)) {
    return;
  }

  setCuboidSize(width, depth, height);
}

function setCuboidSize(widthDm, depthDm, heightDm) {
  exitFreeSurfaceMode();
  applyCuboidDimensions(widthDm, depthDm, heightDm);
}

function getCuboidVolumeCm3() {
  return CUBOID.widthDm * CUBOID.depthDm * CUBOID.heightDm;
}

function convertVolumeFromCm3(volumeCm3, unit) {
  if (unit === "mm3") {
    return volumeCm3 * 1000;
  }
  return volumeCm3;
}

function clearCelebration() {
  if (celebrationTimer) {
    window.clearTimeout(celebrationTimer);
    celebrationTimer = null;
  }

  document.querySelector(".quiz-celebration")?.remove();
}

function launchGreenConfetti() {
  clearCelebration();

  const layer = document.createElement("div");
  layer.className = "quiz-celebration";
  layer.setAttribute("aria-hidden", "true");

  const burst = document.createElement("div");
  burst.className = "quiz-confetti-burst";
  layer.append(burst);

  for (let i = 0; i < 80; i += 1) {
    const piece = document.createElement("span");
    piece.className = "quiz-confetti";
    const angle = Math.random() * Math.PI * 2;
    const distance = 120 + Math.random() * 280;
    piece.style.setProperty("--burst-x", `${Math.cos(angle) * distance}px`);
    piece.style.setProperty("--burst-y", `${Math.sin(angle) * distance}px`);
    piece.style.setProperty("--rotation", `${Math.random() * 720 - 360}deg`);
    piece.style.setProperty("--size", `${6 + Math.random() * 10}px`);
    piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    piece.style.animationDelay = `${Math.random() * 0.12}s`;
    burst.append(piece);
  }

  document.body.append(layer);

  celebrationTimer = window.setTimeout(() => {
    clearCelebration();
  }, 1800);
}

function parseVolumeInput(raw) {
  const normalized = String(raw).trim().replace(",", ".");
  if (!normalized) {
    return Number.NaN;
  }
  return Number(normalized);
}

function formatVolumeDraft(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    return "";
  }
  const value = parseVolumeInput(trimmed);
  if (!Number.isFinite(value)) {
    return trimmed;
  }
  return String(value).replace(".", ",");
}

function clearVolumeKeypadError() {
  volumeKeypadError.hidden = true;
  volumeKeypadError.textContent = "";
  volumeKeypadDisplay.classList.remove("is-invalid");
}

function showVolumeKeypadError(message) {
  volumeKeypadError.hidden = false;
  volumeKeypadError.textContent = message;
  volumeKeypadDisplay.classList.add("is-invalid");
}

function validateVolumeKeypadDraft() {
  const raw = volumeKeypadDraft.trim();
  if (!raw) {
    return { ok: true };
  }
  const value = parseVolumeInput(raw);
  if (!Number.isFinite(value)) {
    return { ok: false, message: "Zadej platné číslo." };
  }
  if (value < 0) {
    return { ok: false, message: "Hodnota nemůže být záporná." };
  }
  return { ok: true };
}

function updateVolumeKeypadDisplay() {
  volumeKeypadDisplay.textContent = volumeKeypadDraft;
  const result = validateVolumeKeypadDraft();
  if (!result.ok) {
    showVolumeKeypadError(result.message);
    return;
  }
  clearVolumeKeypadError();
}

function showVolumeKeypad() {
  volumeKeypadDraft = volumeValueInput.value;
  clearVolumeKeypadError();
  updateVolumeKeypadDisplay();
  volumeKeypadOverlay.hidden = false;
  isVolumeKeypadOpen = true;
  volumeValueInput.blur();
}

function hideVolumeKeypad() {
  volumeKeypadDraft = "";
  clearVolumeKeypadError();
  volumeKeypadOverlay.hidden = true;
  volumeKeypadDisplay.textContent = "";
  isVolumeKeypadOpen = false;
}

function insertIntoVolumeKeypadDraft(value) {
  if (value === "," || value === ".") {
    if (volumeKeypadDraft.includes(",") || volumeKeypadDraft.includes(".")) {
      return;
    }
  }
  if (volumeKeypadDraft.length >= 12) {
    return;
  }
  volumeKeypadDraft += value;
  updateVolumeKeypadDisplay();
}

function clearVolumeKeypadDraft() {
  volumeKeypadDraft = "";
  updateVolumeKeypadDisplay();
}

function confirmVolumeKeypad() {
  const result = validateVolumeKeypadDraft();
  if (!result.ok) {
    showVolumeKeypadError(result.message);
    return;
  }

  volumeValueInput.value = formatVolumeDraft(volumeKeypadDraft);
  hideVolumeKeypad();
  resetVolumeQuizFeedback();
}

function handleVolumeKeypadClick(event) {
  const key = event.currentTarget;
  const action = key.getAttribute("data-action");
  const value = key.getAttribute("data-value");

  if (action === "clear") {
    clearVolumeKeypadDraft();
    return;
  }

  if (value) {
    insertIntoVolumeKeypadDraft(value);
  }
}

function resetVolumeQuizFeedback() {
  volumeAnswerRow.classList.remove("is-correct", "is-wrong");
  volumeFeedback.textContent = "";
  volumeFeedback.classList.remove("is-correct", "is-wrong");
}

function resetVolumeQuiz() {
  volumeValueInput.value = "";
  resetVolumeQuizFeedback();
}

function verifyVolumeAnswer() {
  const value = parseVolumeInput(volumeValueInput.value);
  const unit = volumeUnitSelect.value;

  resetVolumeQuizFeedback();

  if (!Number.isFinite(value)) {
    volumeAnswerRow.classList.add("is-wrong");
    volumeFeedback.classList.add("is-wrong");
    volumeFeedback.textContent = "Zadej číslo.";
    return;
  }

  const expected = convertVolumeFromCm3(getCuboidVolumeCm3(), unit);
  const isCorrect = Math.abs(value - expected) < 0.001;

  if (isCorrect) {
    volumeAnswerRow.classList.add("is-correct");
    volumeFeedback.classList.add("is-correct");
    volumeFeedback.textContent = "Správně!";
    launchGreenConfetti();
    return;
  }

  volumeAnswerRow.classList.add("is-wrong");
  volumeFeedback.classList.add("is-wrong");
  volumeFeedback.textContent = "To není správně. Zkus to znovu.";
}

function generateRandomCuboid() {
  const max = getMaxCuboidDm();
  setCuboidSize(
    randomInt(CUBOID_MIN_DM, max.widthDm),
    randomInt(CUBOID_MIN_DM, max.depthDm),
    randomInt(CUBOID_MIN_DM, max.heightDm),
  );
}

function handleViewportChange() {
  if (isFreeSurfaceMode) {
    if (!isFreeSurfaceCuboid(CUBOID.widthDm, CUBOID.depthDm, CUBOID.heightDm)) {
      applyFreeSurfaceCuboid();
    } else {
      updateViewBox();
    }
    return;
  }

  const clamped = clampCuboidSize(CUBOID.widthDm, CUBOID.depthDm, CUBOID.heightDm);
  if (
    clamped.widthDm !== CUBOID.widthDm ||
    clamped.depthDm !== CUBOID.depthDm ||
    clamped.heightDm !== CUBOID.heightDm
  ) {
    setCuboidSize(clamped.widthDm, clamped.depthDm, clamped.heightDm);
  } else {
    updateCuboidSizeInputs();
    updateViewBox();
  }
}

function initCuboid() {
  generateRandomCuboid();
  requestAnimationFrame(updateViewBox);
}

initCuboid();
initStackCubeScales();
updateToolbarModeState();
updateCuboidSizeInputs();
modeCuboidBtn.addEventListener("click", () => {
  if (isFreeSurfaceMode) {
    generateRandomCuboid();
  }
});
modeFreeBtn.addEventListener("click", enterFreeSurfaceMode);
newCuboidBtn.addEventListener("click", generateRandomCuboid);
document.querySelectorAll(".step-btn[data-dim-input]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.dimInput);
    if (!input) {
      return;
    }

    stepCuboidDim(input, button.classList.contains("step-up") ? 1 : -1);
  });
});
[cuboidWidthInput, cuboidDepthInput, cuboidHeightInput].forEach((input) => {
  input.addEventListener("input", updateCuboidDimStepButtonsAll);
  input.addEventListener("change", applyCuboidSizeFromInputs);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      applyCuboidSizeFromInputs();
    }
  });
});
volumeValueInput.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  showVolumeKeypad();
});
volumeKeypadConfirm.addEventListener("click", confirmVolumeKeypad);
volumeKeypadCancel.addEventListener("click", hideVolumeKeypad);
volumeKeypadOverlay.addEventListener("click", (event) => {
  if (event.target === volumeKeypadOverlay) {
    hideVolumeKeypad();
  }
});
verifyBtn.addEventListener("click", verifyVolumeAnswer);
volumeUnitSelect.addEventListener("change", resetVolumeQuizFeedback);
volumeMathKeypad.querySelectorAll(".table-math-keypad__key").forEach((keyBtn) => {
  keyBtn.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
  keyBtn.addEventListener("click", handleVolumeKeypadClick);
});
document.addEventListener("keydown", (event) => {
  if (!isVolumeKeypadOpen) {
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    hideVolumeKeypad();
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    confirmVolumeKeypad();
  }
});
window.addEventListener("resize", handleViewportChange);
