1|jest.mock('../../core/database/database', () => {
2|  const mockDb = {
3|    execAsync: jest.fn().mockResolvedValue(undefined),
4|    runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
5|    getFirstAsync: jest.fn(),
6|    getAllAsync: jest.fn(),
7|  };
8|
9|  return {
10|    getDatabase: jest.fn().mockResolvedValue(mockDb),
11|  };
12|});
13|
14|import { generateHashForBill, rebuildHashChain, verifyHashChain } from '../../core/hashchain/hashchain';
15|import * as database from '../../core/database/database';
16|
17|function getMockDb() {
18|  return database.getDatabase() as unknown as Promise<{
19|    execAsync: jest.Mock;
20|    runAsync: jest.Mock;
21|    getFirstAsync: jest.Mock;
22|    getAllAsync: jest.Mock;
23|  }>;
24|}
25|
26|describe('hashchain security', () => {
27|  beforeEach(() => {
28|    jest.clearAllMocks();
29|    process.env.WEALTH_MANAGER_HASHCHAIN_KEY = 'unit-test-hash-key';
30|  });
31|
32|  test('generateHashForBill writes an HMAC-based hash', async () => {
33|    const mockDb = await getMockDb();
34|    mockDb.getFirstAsync
35|      .mockResolvedValueOnce({
36|        id: 'bill-1',
37|        amount: 99,
38|        category: '餐饮',
39|        tags: '["lunch"]',
40|        merchant: 'Cafe',
41|        raw_description: 'Cafe lunch',
42|        date: '2026-06-08',
43|        note: 'team lunch',
44|        type: 'expense',
45|        source: 'manual',
46|        created_at: '2026-06-08T10:00:00.000Z',
47|      })
48|      .mockResolvedValueOnce({ hash: 'previous-hash' });
49|
50|    const result = await generateHashForBill('bill-1', 'bill-0');
51|
52|    expect(result).toBe(true);
53|    expect(mockDb.runAsync).toHaveBeenCalledWith(
54|      'UPDATE bills SET hash = ?, prev_hash = ? WHERE id = ?',
55|      [expect.stringMatching(/^[a-f0-9]{64}$/), 'previous-hash', 'bill-1']
56|    );
57|  });
58|
59|  test('verifyHashChain detects tampering in covered fields', async () => {
60|    const baseBill = {
61|      id: 'bill-1',
62|      amount: 99,
63|      category: '餐饮',
64|      tags: '["lunch"]',
65|      merchant: 'Cafe',
66|      raw_description: 'Cafe lunch',
67|      date: '2026-06-08',
68|      note: 'team lunch',
69|      type: 'expense',
70|      source: 'manual',
71|      created_at: '2026-06-08T10:00:00.000Z',
72|    };
73|
74|    const mockDb = await getMockDb();
75|    mockDb.getFirstAsync
76|      .mockResolvedValueOnce(baseBill)
77|      .mockResolvedValueOnce(null);
78|
79|    await generateHashForBill('bill-1');
80|    const writtenHash = mockDb.runAsync.mock.calls[0][1][0];
81|
82|    mockDb.getAllAsync.mockResolvedValue([
83|      {
84|        ...baseBill,
85|        note: 'tampered note',
86|        hash: writtenHash,
87|        prev_hash: '',
88|      },
89|    ]);
90|
91|    const result = await verifyHashChain();
92|
93|    expect(result.valid).toBe(false);
94|    expect(result.firstBrokenBillId).toBe('bill-1');
95|  });
96|
97|  test('rebuildHashChain repairs broken hashes with HMAC values', async () => {
98|    const mockDb = await getMockDb();
99|    mockDb.getAllAsync.mockResolvedValue([
100|      {
101|        id: 'bill-1',
102|        amount: 10,
103|        category: '餐饮',
104|        tags: '[]',
105|        merchant: 'Shop',
106|        raw_description: 'Shop',
107|        date: '2026-06-08',
108|        note: '',
109|        type: 'expense',
110|        source: 'manual',
111|        created_at: '2026-06-08T10:00:00.000Z',
112|        hash: 'broken',
113|        prev_hash: '',
114|      },
115|    ]);
116|
117|    const result = await rebuildHashChain();
118|
119|    expect(result.success).toBe(true);
120|    expect(result.fixed).toBe(1);
121|    expect(mockDb.runAsync).toHaveBeenCalledWith(
122|      'UPDATE bills SET hash = ?, prev_hash = ? WHERE id = ?',
123|      [expect.stringMatching(/^[a-f0-9]{64}$/), '', 'bill-1']
124|    );
125|  });
126|});
127|