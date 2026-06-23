import { describe, it, expect, beforeEach } from 'vitest';
import { transformRecordsToElements } from '../src/utils/graph-transformer.js';

describe('Graph Transformation Tests', () => {
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
      personNodeKey: 'p1', // Same person, different company
      公司代號: '2330',
      公司名稱: '台積電',
      姓名: '張安平',
      職稱: '顧問',
      資料年月: '11504'
    }
  ];

  it('should transform records into correct number of nodes and edges', () => {
    const elements = transformRecordsToElements(mockRecords);
    
    // Nodes:
    // 1. company_1101
    // 2. person_p1
    // 3. person_p2
    // 4. company_2330
    // 5. person_p3
    // Total 5 nodes
    const nodes = elements.filter(el => el.data.type === 'company' || el.data.type === 'person');
    expect(nodes).toHaveLength(5);

    // Edges:
    // 1. e1
    // 2. e2
    // 3. e3
    // 4. e4
    // Total 4 edges
    const edges = elements.filter(el => el.data.source && el.data.target);
    expect(edges).toHaveLength(4);
  });

  it('should correctly map edge source and target', () => {
    const elements = transformRecordsToElements(mockRecords);
    const edge1 = elements.find(el => el.data.id === 'e1');
    
    expect(edge1.data.source).toBe('person_p1');
    expect(edge1.data.target).toBe('company_1101');
    expect(edge1.data.title).toBe('董事長');
  });

  it('should maintain unique nodes even with multiple edges for same person/company', () => {
    const elements = transformRecordsToElements(mockRecords);
    const nodeIds = elements
      .filter(el => el.data.id)
      .map(el => el.data.id);
    
    // Use Set to find unique IDs
    const uniqueIds = new Set(nodeIds);
    
    // Total elements: 5 nodes + 4 edges = 9
    expect(uniqueIds.size).toBe(9);
  });
});
