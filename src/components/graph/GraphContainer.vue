<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue';
import cytoscape from 'cytoscape';

const props = defineProps({
  elements: {
    type: Array,
    required: true,
    default: () => []
  },
  layoutName: {
    type: String,
    default: 'cose'
  },
  selectedId: {
    type: String,
    default: null
  }
});

const emit = defineEmits(['ready', 'nodeSelected', 'edgeSelected']);

const containerRef = ref(null);
const tooltip = ref({
  visible: false,
  x: 0,
  y: 0,
  title: '',
  subtitle: ''
});
let cy = null;
let resizeObserver = null;

const LARGE_GRAPH_THRESHOLD = 2000;
const COSE_ANIMATION_THRESHOLD = 600;

const hideTooltip = () => {
  tooltip.value.visible = false;
};

const updateTooltipFromEvent = (evt, data = {}) => {
  if (!containerRef.value) return;
  const x = evt?.renderedPosition?.x ?? 0;
  const y = evt?.renderedPosition?.y ?? 0;

  tooltip.value = {
    visible: true,
    x: x + 14,
    y: y + 14,
    title: data?.label || data?.name || data?.companyName || data?.id || '未命名',
    subtitle: data?.title || data?.type || ''
  };
};

const clearNeighborhood = () => {
  if (!cy) return;
  cy.elements().removeClass('faded neighbor');
};

const highlightNeighborhood = (target) => {
  if (!cy || !target || target.empty()) {
    clearNeighborhood();
    return;
  }

  cy.elements().addClass('faded').removeClass('neighbor');

  const focused = target.isNode()
    ? target.closedNeighborhood()
    : target.union(target.connectedNodes());

  focused.removeClass('faded');
  focused.addClass('neighbor');
};

const getLayoutConfig = (elementCount) => {
  const isLargeGraph = elementCount >= LARGE_GRAPH_THRESHOLD;

  if (isLargeGraph) {
    // For large graphs, use breadthfirst to reduce radial pile-ups and keep UI responsive.
    return {
      name: 'breadthfirst',
      directed: true,
      spacingFactor: 1.35,
      avoidOverlap: true,
      nodeDimensionsIncludeLabels: true,
      animate: false,
      fit: true,
      padding: 40
    };
  }

  // For normal size graphs, tune cose to improve spacing and avoid overlap.
  return {
    name: props.layoutName || 'cose',
    animate: elementCount < COSE_ANIMATION_THRESHOLD,
    fit: true,
    padding: 40,
    nodeDimensionsIncludeLabels: true,
    idealEdgeLength: () => 110,
    nodeRepulsion: () => 160000,
    edgeElasticity: () => 120,
    gravity: 1,
    numIter: 1400,
    initialTemp: 1000,
    coolingFactor: 0.95,
    minTemp: 1
  };
};

/**
 * Initializes Cytoscape instance.
 */
const initCytoscape = () => {
  if (!containerRef.value) return;

  cy = cytoscape({
    container: containerRef.value,
    elements: props.elements,
    style: [
      {
        selector: 'node',
        style: {
          'label': 'data(label)',
          'width': 40,
          'height': 40,
          'font-size': '9px',
          'text-valign': 'bottom',
          'text-margin-y': 8,
          'text-wrap': 'wrap',
          'text-max-width': '92px',
          'text-background-color': '#fff8ec',
          'text-background-opacity': 0.82,
          'text-background-padding': '2px',
          'color': '#202a2f',
          'font-weight': 600,
          'background-color': '#5f6870',
          'border-width': 1,
          'border-color': '#e3d3bd'
        }
      },
      {
        selector: 'node[type="company"]',
        style: {
          'background-color': '#394952',
          'shape': 'rectangle',
          'width': 62,
          'height': 34,
          'border-width': 2,
          'border-color': '#8ea0ac'
        }
      },
      {
        selector: 'node[type="person"]',
        style: {
          'background-color': '#d6653f',
          'border-width': 2,
          'border-color': '#f3c1a8',
          'shape': 'ellipse'
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 2,
          'line-color': '#98876f',
          'curve-style': 'bezier',
          'target-arrow-shape': 'triangle',
          'target-arrow-color': '#98876f',
          'label': 'data(title)',
          'font-size': '8px',
          'color': '#4f5a61',
          'text-rotation': 'autorotate',
          'text-margin-y': -10
        }
      },
      {
        selector: ':selected',
        style: {
          'background-color': '#e56f47',
          'line-color': '#d1532b',
          'target-arrow-color': '#d1532b',
          'border-width': 3,
          'border-color': '#ffe0a8'
        }
      },
      {
        selector: 'node[layerState = "dimmed"]',
        style: {
          'opacity': 0.24,
          'text-opacity': 0.22,
          'z-index': 8
        }
      },
      {
        selector: 'edge[layerState = "dimmed"]',
        style: {
          'opacity': 0.2,
          'text-opacity': 0.18,
          'z-index': 8
        }
      },
      {
        selector: '.faded',
        style: {
          'opacity': 0.16,
          'text-opacity': 0.18
        }
      },
      {
        selector: '.neighbor',
        style: {
          'opacity': 1,
          'text-opacity': 1,
          'line-color': '#d4552d',
          'target-arrow-color': '#d4552d',
          'z-index': 999
        }
      }
    ],
    layout: getLayoutConfig(props.elements.length)
  });

  // Event listeners
  cy.on('tap', 'node', (evt) => {
    highlightNeighborhood(evt.target);
    emit('nodeSelected', evt.target.data());
  });

  cy.on('tap', 'edge', (evt) => {
    highlightNeighborhood(evt.target);
    emit('edgeSelected', evt.target.data());
  });

  cy.on('mouseover', 'node, edge', (evt) => {
    updateTooltipFromEvent(evt, evt.target.data());
  });

  cy.on('mousemove', 'node, edge', (evt) => {
    if (!tooltip.value.visible) return;
    updateTooltipFromEvent(evt, evt.target.data());
  });

  cy.on('mouseout', 'node, edge', () => {
    hideTooltip();
  });

  // Deselect when tapping background
  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      clearNeighborhood();
      hideTooltip();
      emit('nodeSelected', null);
      emit('edgeSelected', null);
    }
  });

  emit('ready', cy);
};

/**
 * Updates elements when props change.
 */
watch(() => props.elements, (newElements) => {
  if (cy) {
    cy.json({ elements: newElements });
    cy.layout(getLayoutConfig(newElements.length)).run();
  }
}, { deep: true });

/**
 * Handles selection highlighting when selectedId changes.
 */
watch(() => props.selectedId, (newId) => {
  if (!cy) return;
  
  cy.elements().unselect();
  if (newId) {
    const el = cy.getElementById(newId);
    if (el) {
      el.select();
      highlightNeighborhood(el);
      // Optional: zoom to selected element
      // cy.animate({ center: { eles: el }, zoom: 1.5 }, { duration: 500 });
    }
  } else {
    clearNeighborhood();
  }
});

/**
 * Handles container resizing.
 */
const setupResizeObserver = () => {
  resizeObserver = new ResizeObserver(() => {
    if (cy) {
      cy.resize();
      cy.fit();
    }
  });
  resizeObserver.observe(containerRef.value);
};

onMounted(() => {
  initCytoscape();
  setupResizeObserver();
});

onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect();
  hideTooltip();
  if (cy) cy.destroy();
});

// Expose methods to parent
defineExpose({
  runLayout: () => cy && cy.layout(getLayoutConfig(cy.elements().length)).run(),
  getElements: () => cy ? cy.elements() : [],
  destroy: () => cy && cy.destroy()
});
</script>

<template>
  <div class="graph-shell">
    <div ref="containerRef" class="graph-container"></div>
    <div
      v-if="tooltip.visible"
      class="graph-tooltip"
      :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
    >
      <div class="graph-tooltip-title">{{ tooltip.title }}</div>
      <div v-if="tooltip.subtitle" class="graph-tooltip-subtitle">{{ tooltip.subtitle }}</div>
    </div>
  </div>
</template>

<style scoped>
.graph-shell {
  width: 100%;
  height: 100%;
  position: relative;
}

.graph-container {
  width: 100%;
  height: 100%;
  background:
    radial-gradient(circle at 22% 18%, rgba(255, 247, 233, 0.92) 0%, rgba(240, 231, 214, 0.75) 36%, rgba(223, 212, 190, 0.7) 100%),
    linear-gradient(130deg, #efe6d8 0%, #e4d9c5 100%);
  overflow: hidden;
}

.graph-tooltip {
  position: absolute;
  pointer-events: none;
  min-width: 96px;
  max-width: 220px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid rgba(234, 204, 158, 0.85);
  background: rgba(39, 50, 56, 0.92);
  color: #f9f2e3;
  box-shadow: 0 10px 22px rgba(15, 18, 20, 0.3);
  z-index: 1200;
}

.graph-tooltip-title {
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1.2;
}

.graph-tooltip-subtitle {
  margin-top: 2px;
  font-size: 0.72rem;
  color: #eac791;
}
</style>
