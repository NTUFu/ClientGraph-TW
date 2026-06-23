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
let cy = null;
let resizeObserver = null;

const LARGE_GRAPH_THRESHOLD = 2000;
const COSE_ANIMATION_THRESHOLD = 600;

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
          'text-background-color': '#ffffff',
          'text-background-opacity': 0.78,
          'text-background-padding': '2px',
          'background-color': '#666'
        }
      },
      {
        selector: 'node[type="company"]',
        style: {
          'background-color': '#3498db',
          'shape': 'rectangle',
          'width': 62,
          'height': 34
        }
      },
      {
        selector: 'node[type="person"]',
        style: {
          'background-color': '#2ecc71',
          'shape': 'ellipse'
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 2,
          'line-color': '#ccc',
          'curve-style': 'bezier',
          'target-arrow-shape': 'triangle',
          'target-arrow-color': '#ccc',
          'label': 'data(title)',
          'font-size': '8px',
          'text-rotation': 'autorotate',
          'text-margin-y': -10
        }
      },
      {
        selector: ':selected',
        style: {
          'background-color': '#e74c3c',
          'line-color': '#e74c3c',
          'target-arrow-color': '#e74c3c',
          'border-width': 3,
          'border-color': '#f1c40f'
        }
      }
    ],
    layout: getLayoutConfig(props.elements.length)
  });

  // Event listeners
  cy.on('tap', 'node', (evt) => {
    emit('nodeSelected', evt.target.data());
  });

  cy.on('tap', 'edge', (evt) => {
    emit('edgeSelected', evt.target.data());
  });

  // Deselect when tapping background
  cy.on('tap', (evt) => {
    if (evt.target === cy) {
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
      // Optional: zoom to selected element
      // cy.animate({ center: { eles: el }, zoom: 1.5 }, { duration: 500 });
    }
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
  <div ref="containerRef" class="graph-container"></div>
</template>

<style scoped>
.graph-container {
  width: 100%;
  height: 100%;
  background-color: #f8f9fa;
  overflow: hidden;
}
</style>
