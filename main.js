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
const CONTENT_LABEL_PADDING = 22;
const VIEWPORT_SAFETY = 0.92;
const MIN_FIT_SCALE = 0.75;
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
const FREE_ZOOM_MIN = 1;
const FREE_ZOOM_MAX = 3;
const FREE_ZOOM_STEP = 0.1;

const CUBE_TYPES = {
  cm3: {
    subSize: SUB,
    scale: CUBE_SCALE_TO_WIREFRAME,
    origin: CM_CUBE_ORIGIN,
    templateId: "cm-cube-shape",
    fillTemplateId: "cm-cube-fill",
    strokeTemplateId: "cm-cube-stroke",
    stackCenter: { x: 40.65, y: 41 },
    hit: { x: 18, y: 18, w: 46, h: 46 },
  },
  mm3: {
    subSize: 1,
    scale: CUBE_SCALE_TO_WIREFRAME,
    origin: MM_CUBE_ORIGIN,
    templateId: "mm-cube-shape",
    fillTemplateId: "mm-cube-fill",
    strokeTemplateId: "mm-cube-stroke",
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
const zoomSlider = document.getElementById("zoom-slider");
const zoomOutBtn = document.getElementById("zoom-out-btn");
const zoomInBtn = document.getElementById("zoom-in-btn");
const canvasPanToggle = document.getElementById("canvas-pan-toggle");
const boardPanCatch = document.getElementById("board-pan-catch");
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
const placedCubeFills = document.getElementById("placed-cube-fills");
const placedCubeStrokes = document.getElementById("placed-cube-strokes");
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
let freeZoom = FREE_ZOOM_MIN;
let freePan = { x: 0, y: 0 };
let isPanMode = false;
let panDrag = null;
let celebrationTimer = null;
let volumeKeypadDraft = "";
let isVolumeKeypadOpen = false;
const occupancy = new Map();

function occupancyKey(sx, sy, sz) {
  return `${sx},${sy},${sz}`;
}

function getLocalPoint(clientX, clientY) {
  const ctm = content.getScreenCTM();
  if (!ctm) {
    return { x: 0, y: 0 };
  }

  const point = diagram.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  return point.matrixTransform(ctm.inverse());
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

// Vrátí buňku mřížky, do které krychle patří.
//
// Pod kurzorem neleží jedna buňka, ale celý paprsek buněk nad sebou, které se promítnou
// na stejné místo. Paprsek sestavíme tak, že v každém patře dopočítáme přesné sx/sy –
// to je právě ta buňka, kterou kurzor v daném patře protíná. Sousední buňky do paprsku
// nepatří: u mm³ je od sebe dělí jen 1,4 px, takže by se do výběru vešly taky a krychle
// by pak sedala vedle.
function findNearestCell(anchorX, anchorY, subSize, excludeId) {
  const bounds = getCuboidSubSize();
  const ray = [];

  for (let sz = 0; sz <= bounds.height - subSize; sz += subSize) {
    const exact = screenToSubGridAtLevel(anchorX, anchorY, sz);
    const sx = Math.round(exact.sx / subSize) * subSize;
    const sy = Math.round(exact.sy / subSize) * subSize;
    if (!canPlaceAt(sx, sy, sz, subSize, excludeId)) {
      continue;
    }
    const screen = subGridToScreen(sx, sy, sz);
    ray.push({
      sx,
      sy,
      sz,
      screen,
      distance: Math.hypot(screen.x - anchorX, screen.y - anchorY),
    });
  }

  if (!ray.length) {
    return null;
  }

  // Vybíráme jako při stavění: krychle putuje po paprsku od diváka dozadu a zastaví se
  // na první ploše, na kterou má dosednout. Když cestou žádnou nepotká, opře se úplně
  // vzadu o stěnu kvádru. Rozhoduje jen poloha kurzoru, ne trasa, kudy se krychle vedla.
  ray.sort((a, b) => getCellFarness(a.sx, a.sy, a.sz) - getCellFarness(b.sx, b.sy, b.sz));
  const landing = ray.find((cell) =>
    hasSupportBelow(cell.sx, cell.sy, cell.sz, subSize, excludeId),
  );

  return landing || ray[ray.length - 1];
}

// Když paprsek pod kurzorem mine kvádr (typicky malý kvádr / okraj boxu), najdi nejbližší
// volnou buňku podle vzdálenosti na obrazovce – ať jde ze zásobníku položit do celého boxu.
function findClosestPlaceableCell(anchorX, anchorY, subSize, excludeId) {
  const bounds = getCuboidSubSize();
  let best = null;

  for (let sz = 0; sz <= bounds.height - subSize; sz += subSize) {
    for (let sy = 0; sy <= bounds.depth - subSize; sy += subSize) {
      for (let sx = 0; sx <= bounds.width - subSize; sx += subSize) {
        if (!canPlaceAt(sx, sy, sz, subSize, excludeId)) {
          continue;
        }
        if (!hasSupportBelow(sx, sy, sz, subSize, excludeId)) {
          continue;
        }
        const screen = subGridToScreen(sx, sy, sz);
        const distance = Math.hypot(screen.x - anchorX, screen.y - anchorY);
        if (!best || distance < best.distance) {
          best = { sx, sy, sz, screen, distance };
        }
      }
    }
  }

  return best;
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
  return {
    minX: cuboid.minX - CONTENT_LABEL_PADDING,
    minY: cuboid.minY - CONTENT_LABEL_PADDING,
    maxX: cuboid.maxX + CONTENT_LABEL_PADDING,
    maxY: cuboid.maxY + CONTENT_LABEL_PADDING,
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

// Výplně: mm³ zůstává vidět na ploše cm³. Hrany řadíme zvlášť geometricky.
function isCubeBehindForFill(a, b) {
  if (a.s !== b.s) {
    return a.s > b.s;
  }
  return isCubeBehind(a, b);
}

function orderPaintItems(items, behindFn) {
  const xRatio = WIREFRAME_DEPTH_STEP / WIREFRAME_UNIT;
  const zRatio = WIREFRAME_DEPTH_STEP / WIREFRAME_HEIGHT_STEP;
  const farness = (box) => box.sy - xRatio * box.sx - zRatio * box.sz;
  items.sort((p, q) => farness(q.box) - farness(p.box) || p.box.sx - q.box.sx);

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
      if (behindFn(items[j].box, items[i].box)) {
        visit(j);
      }
    }
    state[i] = 2;
    ordered.push(items[i].element);
  };
  for (let i = 0; i < items.length; i += 1) {
    visit(i);
  }
  return ordered;
}

function getCubeStrokeElement(fillElement) {
  if (!fillElement) {
    return null;
  }
  return placedCubeStrokes.querySelector(`.placed-cube-stroke[data-id="${fillElement.dataset.id}"]`);
}

function setCubeVisibility(fillElement, visible) {
  if (visible) {
    fillElement.removeAttribute("visibility");
    getCubeStrokeElement(fillElement)?.removeAttribute("visibility");
  } else {
    fillElement.setAttribute("visibility", "hidden");
    getCubeStrokeElement(fillElement)?.setAttribute("visibility", "hidden");
  }
}

function removePlacedCube(fillElement) {
  getCubeStrokeElement(fillElement)?.remove();
  fillElement.remove();
}

function sortPlacedCubes() {
  const fills = [...placedCubeFills.querySelectorAll(".placed-cube")].map((element) => ({
    element,
    box: getCubePaintBox(element),
  }));
  const fillOrder = orderPaintItems(fills, isCubeBehindForFill);
  placedCubeFills.replaceChildren(...fillOrder);

  const strokes = fillOrder.map((fill) => {
    const stroke = getCubeStrokeElement(fill);
    return stroke
      ? {
          element: stroke,
          box: getCubePaintBox(fill),
        }
      : null;
  }).filter(Boolean);
  const strokeOrder = orderPaintItems(strokes, isCubeBehind);
  placedCubeStrokes.replaceChildren(...strokeOrder);
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

  // Vyber "nejvíc navrchu". 1 mm³ má přednost před 1 cm³, jinak podle pozice na obrazovce.
  candidates.sort((a, b) => {
    const aSize = CUBE_TYPES[a.dataset.type].subSize;
    const bSize = CUBE_TYPES[b.dataset.type].subSize;
    if (aSize !== bSize) {
      return bSize - aSize;
    }
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

function cloneCubeShape(type, part = "shape") {
  const def = CUBE_TYPES[type];
  const templateId =
    part === "fill"
      ? def.fillTemplateId
      : part === "stroke"
        ? def.strokeTemplateId
        : def.templateId;
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `#${templateId}`);
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
  const transform = `translate(${anchorX - def.origin.x * def.scale}, ${anchorY - def.origin.y * def.scale})`;
  element.setAttribute("transform", transform);
  getCubeStrokeElement(element)?.setAttribute("transform", transform);
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
  const transform = cubeTransformForGrid(element.dataset.type, sx, sy, sz);
  element.setAttribute("transform", transform);
  getCubeStrokeElement(element)?.setAttribute("transform", transform);
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
  const id = String(++cubeCounter);
  const scale = `scale(${def.scale})`;

  const fillGroup = document.createElementNS(SVG_NS, "g");
  fillGroup.classList.add("placed-cube");
  fillGroup.dataset.type = type;
  fillGroup.dataset.id = id;
  const fillVisual = document.createElementNS(SVG_NS, "g");
  fillVisual.setAttribute("transform", scale);
  fillVisual.appendChild(cloneCubeShape(type, "fill"));
  fillGroup.appendChild(fillVisual);
  fillGroup.appendChild(createPlacedCubeHitArea(type));

  const strokeGroup = document.createElementNS(SVG_NS, "g");
  strokeGroup.classList.add("placed-cube-stroke");
  strokeGroup.dataset.type = type;
  strokeGroup.dataset.id = id;
  const strokeVisual = document.createElementNS(SVG_NS, "g");
  strokeVisual.setAttribute("transform", scale);
  strokeVisual.appendChild(cloneCubeShape(type, "stroke"));
  strokeGroup.appendChild(strokeVisual);

  placedCubeFills.appendChild(fillGroup);
  placedCubeStrokes.appendChild(strokeGroup);
  setCubeGridPosition(fillGroup, sx, sy, sz);
  markOccupied(sx, sy, sz, def.subSize, id);
  sortPlacedCubes();
  return fillGroup;
}

function bringToFront(element) {
  placedCubeFills.appendChild(element);
  const stroke = getCubeStrokeElement(element);
  if (stroke) {
    placedCubeStrokes.appendChild(stroke);
  }
}

function getStackVisual(targetElement) {
  return targetElement.querySelector(".stack-visual") || targetElement;
}

function createDragGhost(type, rect, sourceVisual) {
  const ghost = document.createElement("div");
  ghost.className = `drag-ghost drag-ghost--${type}`;
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  if (sourceVisual) {
    ghost.appendChild(sourceVisual.cloneNode(true));
  }
  document.body.append(ghost);
  return ghost;
}

function clearDragGhost() {
  if (dragState?.ghost) {
    dragState.ghost.remove();
    dragState.ghost = null;
  }
}

function updateDragGhost(clientX, clientY) {
  if (!dragState?.ghost) {
    return;
  }
  dragState.ghost.style.left = `${clientX - dragState.screenOffsetX}px`;
  dragState.ghost.style.top = `${clientY - dragState.screenOffsetY}px`;
}

function isPointerInStack(clientX, clientY) {
  const stackRect = cubeStack.getBoundingClientRect();
  return (
    clientX >= stackRect.left &&
    clientX <= stackRect.right &&
    clientY >= stackRect.top &&
    clientY <= stackRect.bottom
  );
}

function isPointerInBoard(clientX, clientY) {
  const board = document.querySelector(".board-stage") || diagram;
  const rect = board.getBoundingClientRect();
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}

function startDragFromStack(type, clientX, clientY, targetElement) {
  const def = CUBE_TYPES[type];
  const visual = getStackVisual(targetElement);
  const rect = visual.getBoundingClientRect();
  const screenOffsetX = clientX - rect.left;
  const screenOffsetY = clientY - rect.top;
  const cells = def.subSize / SUB;
  // Zásobník ukazuje celý průmět (včetně hloubky); kotva je vlevo dole.
  const { w, h, d } = getCubeProjectionSize(cells);
  const silW = w + d;
  const silH = h + d;
  const clickOffsetX = (screenOffsetX / Math.max(rect.width, 1)) * silW;
  const clickOffsetY = (screenOffsetY / Math.max(rect.height, 1)) * silH - silH;
  const point = getLocalPoint(clientX, clientY);

  const cube = createPlacedCube(type, 0, 0, 0);
  clearOccupied(cube.dataset.id);
  setCubeScreenAnchor(cube, point.x - clickOffsetX, point.y - clickOffsetY);
  bringToFront(cube);
  cube.classList.add("is-dragging");
  setCubeVisibility(cube, false);
  placedCubesLayer.classList.add("is-dragging");
  diagram.classList.add("is-dragging");

  dragState = {
    element: cube,
    ghost: createDragGhost(type, rect, visual),
    screenOffsetX,
    screenOffsetY,
    offsetX: clickOffsetX,
    offsetY: clickOffsetY,
    fromStack: true,
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
    ghost: null,
    screenOffsetX: 0,
    screenOffsetY: 0,
    offsetX: localX - anchor.x,
    offsetY: localY - anchor.y,
    fromStack: false,
    pointerId: null,
  };
}

function resolveSnapCell(
  anchorX,
  anchorY,
  cursorX,
  cursorY,
  subSize,
  excludeId,
  fromStack,
  pointerInBoard,
) {
  if (fromStack) {
    // Ze zásobníku nad pravým boxem položíme i když paprsek mine malý kvádr.
    return (
      findNearestCell(anchorX, anchorY, subSize, excludeId) ||
      findNearestCell(cursorX, cursorY, subSize, excludeId) ||
      (pointerInBoard ? findClosestPlaceableCell(cursorX, cursorY, subSize, excludeId) : null)
    );
  }

  // U už položené krychle držíme přísnější hranici průmětu, ať jde odtáhnout pryč.
  if (!shouldSnapToCuboid(anchorX, anchorY) && !shouldSnapToCuboid(cursorX, cursorY)) {
    return null;
  }
  return findNearestCell(anchorX, anchorY, subSize, excludeId);
}

function updateDrag(localX, localY) {
  if (!dragState) {
    return;
  }

  // Během tahu krychle jen sleduje kurzor – do mřížky skočí až při puštění.
  const anchorX = localX - dragState.offsetX;
  const anchorY = localY - dragState.offsetY;
  setCubeScreenAnchor(dragState.element, anchorX, anchorY);

  if (dragState.fromStack) {
    setCubeVisibility(dragState.element, false);
    if (dragState.ghost) {
      dragState.ghost.style.visibility = "visible";
    }
  }

  bringToFront(dragState.element);
}

function endDrag(clientX, clientY) {
  if (!dragState) {
    return;
  }

  const { element, fromStack, offsetX, offsetY } = dragState;
  const def = CUBE_TYPES[element.dataset.type];
  const id = element.dataset.id;
  const point = getLocalPoint(clientX, clientY);
  const anchorX = point.x - offsetX;
  const anchorY = point.y - offsetY;

  const pointerInBoard = isPointerInBoard(clientX, clientY);
  const cell = resolveSnapCell(
    anchorX,
    anchorY,
    point.x,
    point.y,
    def.subSize,
    id,
    fromStack,
    pointerInBoard,
  );

  clearDragGhost();
  element.classList.remove("is-dragging");
  placedCubesLayer.classList.remove("is-dragging");
  diagram.classList.remove("is-dragging");
  dragState = null;

  const dropOnStack = isPointerInStack(clientX, clientY);
  const dropOutsideBoard = fromStack && !pointerInBoard;

  // Krychle existuje jen v mřížce. Puštěná mimo kvádr nebo zpět do zásobníku mizí.
  if (dropOnStack || dropOutsideBoard || !cell) {
    clearOccupied(id);
    removePlacedCube(element);
    sortPlacedCubes();
    return;
  }

  setCubeVisibility(element, true);
  setCubeGridPosition(element, cell.sx, cell.sy, cell.sz);
  markOccupied(cell.sx, cell.sy, cell.sz, def.subSize, id);
  sortPlacedCubes();
}

const dragMoveOptions = { passive: false, capture: true };
const dragEndOptions = { capture: true };

function stopDragListeners() {
  window.removeEventListener("pointermove", handleDragPointerMove, dragMoveOptions);
  window.removeEventListener("pointerup", handleDragPointerUp, dragEndOptions);
  window.removeEventListener("pointercancel", handleDragPointerUp, dragEndOptions);
}

function handleDragPointerMove(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();
  updateDragGhost(event.clientX, event.clientY);
  const point = getLocalPoint(event.clientX, event.clientY);
  updateDrag(point.x, point.y);
}

function handleDragPointerUp(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) {
    return;
  }

  stopDragListeners();
  endDrag(event.clientX, event.clientY);
}

function beginDragTracking(pointerId) {
  dragState.pointerId = pointerId;
  window.addEventListener("pointermove", handleDragPointerMove, dragMoveOptions);
  window.addEventListener("pointerup", handleDragPointerUp, dragEndOptions);
  window.addEventListener("pointercancel", handleDragPointerUp, dragEndOptions);
}

cubeStack.addEventListener("pointerdown", (event) => {
  const stackCube = event.target.closest(".stack-cube");
  if (!stackCube || !cubeStack.contains(stackCube)) {
    return;
  }

  event.preventDefault();
  startDragFromStack(stackCube.dataset.type, event.clientX, event.clientY, stackCube);
  beginDragTracking(event.pointerId);
});

placedCubesLayer.addEventListener("pointerdown", (event) => {
  const placedCube = pickPlacedCubeFromEvent(event);
  if (!placedCube) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  const point = getLocalPoint(event.clientX, event.clientY);
  startDragPlacedCube(placedCube, point.x, point.y);
  beginDragTracking(event.pointerId);
});

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
  // Stabilní měřítko podle celého diagramu – stejná velikost krychlí v módu kvádr
  // i ve volné ploše při 100 % zoomu. ViewBox v módu kvádr ořízneme na obsah zvlášť.
  const available = getAvailableDiagramSize();
  return Math.min(
    (available.width * VIEWPORT_SAFETY) / DIAGRAM_WIDTH,
    (available.height * VIEWPORT_SAFETY) / DIAGRAM_HEIGHT,
  );
}

// Zásobník drží stejnou velikost jako položené krychle při minimálním přiblížení.
function updateStackCubeSizes() {
  const fitScale = getFitScale();
  const cmW = (CUBE_PROJ_WIDTH + CUBE_PROJ_DEPTH) * fitScale;
  const cmH = (CUBE_PROJ_HEIGHT + CUBE_PROJ_DEPTH) * fitScale;
  const mmW = cmW / SUB;
  const mmH = cmH / SUB;
  const root = document.documentElement;

  root.style.setProperty("--stack-cm3-w", `${cmW}px`);
  root.style.setProperty("--stack-cm3-h", `${cmH}px`);
  root.style.setProperty("--stack-mm3-w", `${mmW}px`);
  root.style.setProperty("--stack-mm3-h", `${mmH}px`);
  // Malá mm³ krychle potřebuje větší úchopnou plochu.
  root.style.setProperty("--stack-mm3-hit", `${Math.max(36, mmW * 4)}px`);
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
  placedCubeFills.replaceChildren();
  placedCubeStrokes.replaceChildren();
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

function getActiveZoom() {
  return isFreeSurfaceMode ? freeZoom : 1;
}

function syncZoomControls() {
  const pct = Math.round(freeZoom * 100);
  zoomSlider.value = String(pct);
  zoomSlider.setAttribute("aria-valuenow", String(pct));
  zoomSlider.setAttribute("aria-valuetext", `${pct} procent`);
  zoomOutBtn.disabled = freeZoom <= FREE_ZOOM_MIN + 1e-9;
  zoomInBtn.disabled = freeZoom >= FREE_ZOOM_MAX - 1e-9;
}

function applyBoardTransformCss() {
  diagramWrap.style.setProperty("--board-pan-x", `${freePan.x}px`);
  diagramWrap.style.setProperty("--board-pan-y", `${freePan.y}px`);
  diagramWrap.style.setProperty("--board-zoom", String(getActiveZoom()));
}

function resetBoardPan() {
  freePan = { x: 0, y: 0 };
  panDrag = null;
  boardPanCatch.classList.remove("is-dragging-pan");
  applyBoardTransformCss();
}

function setPanMode(on) {
  isPanMode = on;
  canvasPanToggle.setAttribute("aria-pressed", on ? "true" : "false");
  canvasPanToggle.classList.toggle("is-pressed", on);

  if (on) {
    boardPanCatch.removeAttribute("hidden");
    boardPanCatch.setAttribute("aria-hidden", "false");
  } else {
    boardPanCatch.setAttribute("hidden", "");
    boardPanCatch.setAttribute("aria-hidden", "true");
    boardPanCatch.classList.remove("is-dragging-pan");
    panDrag = null;
  }
}

function setFreeZoom(zoom) {
  freeZoom = Math.min(FREE_ZOOM_MAX, Math.max(FREE_ZOOM_MIN, zoom));
  syncZoomControls();
  applyBoardTransformCss();
}

function resetCuboidOrigin() {
  cuboidOrigin = { ...DEFAULT_CUBOID_ORIGIN };
}

function updateViewBox() {
  // Základní měřítko je vždy stejné jako v módu kvádr. Ve volné ploše ho pak
  // násobí CSS zoom (min. 100 % = stejná velikost krychlí).
  const fitScale = getFitScale();
  updateStackCubeSizes();

  if (isFreeSurfaceMode) {
    const bounds = getContentBounds();
    const contentW = bounds.maxX - bounds.minX;
    const contentH = bounds.maxY - bounds.minY;
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
    applyBoardTransformCss();
    return;
  }

  // Zásobník je v levém panelu – viewBox ořízneme na kvádr, ať pravý box není
  // z poloviny prázdný (dřívější místo pro SVG zásobník) a šlo do něj pohodlně pokládat.
  const bounds = getContentBounds();
  const contentW = bounds.maxX - bounds.minX;
  const contentH = bounds.maxY - bounds.minY;
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
  applyBoardTransformCss();
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
  resetCuboidOrigin();
  clearPlacedCubes();
  resetVolumeQuiz();
  renderCuboidWireframe();
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
  freeZoom = FREE_ZOOM_MIN;
  resetBoardPan();
  setPanMode(false);
  syncZoomControls();
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
  freeZoom = FREE_ZOOM_MIN;
  resetBoardPan();
  setPanMode(false);
  syncZoomControls();
  resetCuboidOrigin();
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
updateToolbarModeState();
updateCuboidSizeInputs();
syncZoomControls();
modeCuboidBtn.addEventListener("click", () => {
  if (isFreeSurfaceMode) {
    generateRandomCuboid();
  }
});
modeFreeBtn.addEventListener("click", enterFreeSurfaceMode);
newCuboidBtn.addEventListener("click", generateRandomCuboid);
zoomSlider.addEventListener("input", () => {
  setFreeZoom(Number(zoomSlider.value) / 100);
});
zoomOutBtn.addEventListener("click", () => {
  setFreeZoom(freeZoom - FREE_ZOOM_STEP);
});
zoomInBtn.addEventListener("click", () => {
  setFreeZoom(freeZoom + FREE_ZOOM_STEP);
});
canvasPanToggle.addEventListener("click", () => {
  if (!isFreeSurfaceMode) {
    return;
  }
  setPanMode(!isPanMode);
});
boardPanCatch.addEventListener("pointerdown", (event) => {
  if (!isPanMode || !isFreeSurfaceMode) {
    return;
  }

  event.preventDefault();
  panDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originX: freePan.x,
    originY: freePan.y,
  };
  boardPanCatch.classList.add("is-dragging-pan");
  boardPanCatch.setPointerCapture(event.pointerId);
});
boardPanCatch.addEventListener("pointermove", (event) => {
  if (!panDrag || panDrag.pointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();
  freePan = {
    x: panDrag.originX + (event.clientX - panDrag.startX),
    y: panDrag.originY + (event.clientY - panDrag.startY),
  };
  applyBoardTransformCss();
});
function endBoardPanDrag(event) {
  if (!panDrag || panDrag.pointerId !== event.pointerId) {
    return;
  }

  if (boardPanCatch.hasPointerCapture(event.pointerId)) {
    boardPanCatch.releasePointerCapture(event.pointerId);
  }
  panDrag = null;
  boardPanCatch.classList.remove("is-dragging-pan");
}
boardPanCatch.addEventListener("pointerup", endBoardPanDrag);
boardPanCatch.addEventListener("pointercancel", endBoardPanDrag);
diagram.addEventListener(
  "wheel",
  (event) => {
    if (!isFreeSurfaceMode) {
      return;
    }

    event.preventDefault();
    const direction = event.deltaY > 0 ? -FREE_ZOOM_STEP : FREE_ZOOM_STEP;
    setFreeZoom(freeZoom + direction);
  },
  { passive: false },
);
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
