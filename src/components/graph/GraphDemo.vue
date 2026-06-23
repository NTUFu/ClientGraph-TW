<script setup>
import { ref, onMounted } from 'vue';
import GraphContainer from './GraphContainer.vue';
import { transformRecordsToElements } from '../../utils/graph-transformer.js';

const graphRef = ref(null);
const elements = ref([]);

// Mock data mimicking real IndexedDB records
const mockRecords = [
  {
    edgeKey: 'e1',
    personNodeKey: 'p1',
    公司代號: '1101',
    公司名稱: '台泥',
    姓名: '張安平',
    職稱: '董事長',
    資料年月: '11504'
  },
  {
    edgeKey: 'e2',
    personNodeKey: 'p2',
    公司代號: '1101',
    公司名稱: '台泥',
    姓名: '程耀輝',
    職稱: '董事',
    資料年月: '11504'
  },
  {
    edgeKey: 'e3',
    personNodeKey: 'p3',
    公司代號: '2330',
    公司名稱: '台積電',
    姓名: '林本偉',
    職稱: '執行長',
    資料年月: '11504'
  },
  {
    edgeKey: 'e4',
    personNodeKey: 'p1', // Same person, different company (test cross-company)
    公司代號: '2330',
    公司名稱: '台積電',
    姓名: '張安平',
    職稱: '顧問',
    資料年月: '11504'
  }
];

onMounted(() => {
  // Transform mock records to cytoscape elements
  elements.value = transformRecordsToElements(mockRecords);
});

const handleRunLayout = () => {
  if (graphRef.value) {
    graphRef.value.runLayout();
  }
};

const onNodeSelected = (data) => {
  console.log('Node selected:', data);
};
</script>

<template>
  <div class="demo-container">
    <div class="toolbar">
      <button @click="handleRunLayout">重新佈局 (Run Layout)</button>
      <span>展示 ${elements.length} 個元素 (含節點與邊)</span>
    </div>
    
    <div class="graph-viewport">
      <GraphContainer 
        ref="graphRef"
        :elements="elements" 
        layout-name="cose"
        @node-selected="onNodeSelected"
      />
    </div>
  </div>
</template>

<style scoped>
.demo-container {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  font-family: sans-serif;
}

.toolbar {
  padding: 10px;
  background: #eee;
  display: flex;
  gap: 20px;
  align-items: center;
  border-bottom: 1px solid #ccc;
}

button {
  padding: 6px 12px;
  cursor: pointer;
}

.graph-viewport {
  flex: 1;
  position: relative;
}
</style>
