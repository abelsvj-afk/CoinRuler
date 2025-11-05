// Integration tests for approval flow
import { MongoClient, Db } from 'mongodb';
import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = process.env.DATABASE_NAME || 'coinruler_test';

describe('Approval Flow Integration Tests', () => {
  let db: Db;
  let client: MongoClient;

  beforeAll(async () => {
    client = await MongoClient.connect(MONGODB_URI);
    db = client.db(DATABASE_NAME);
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  beforeEach(async () => {
    // Clear approvals before each test
    await db.collection('approvals').deleteMany({});
  });

  test('should create a new approval', async () => {
    const approval = {
      type: 'sell',
      coin: 'BTC',
      amount: 0.1,
      title: 'Test approval',
      summary: 'Testing approval creation',
    };

    const response = await axios.post(`${API_URL}/approvals`, approval);
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('id');
    expect(response.data.status).toBe('pending');
  });

  test('should retrieve pending approvals', async () => {
    // Create test approvals
    await db.collection('approvals').insertMany([
      {
        type: 'buy',
        coin: 'ETH',
        amount: 1,
        title: 'Test 1',
        summary: 'Test',
        status: 'pending',
        createdAt: new Date(),
      },
      {
        type: 'sell',
        coin: 'XRP',
        amount: 100,
        title: 'Test 2',
        summary: 'Test',
        status: 'pending',
        createdAt: new Date(),
      },
    ]);

    const response = await axios.get(`${API_URL}/approvals`);
    expect(response.status).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);
    expect(response.data.length).toBe(2);
  });

  test('should approve an approval', async () => {
    const result = await db.collection('approvals').insertOne({
      type: 'sell',
      coin: 'BTC',
      amount: 0.1,
      title: 'Test',
      summary: 'Test',
      status: 'pending',
      createdAt: new Date(),
    });

    const id = result.insertedId.toString();
    const response = await axios.patch(`${API_URL}/approvals/${id}`, {
      status: 'approved',
      actedBy: 'test_user',
    });

    expect(response.status).toBe(200);

    const updated = await db.collection('approvals').findOne({ _id: result.insertedId });
    expect(updated?.status).toBe('approved');
    expect(updated?.actedBy).toBe('test_user');
  });

  test('should decline an approval', async () => {
    const result = await db.collection('approvals').insertOne({
      type: 'stake',
      coin: 'SOL',
      amount: 10,
      title: 'Test',
      summary: 'Test',
      status: 'pending',
      createdAt: new Date(),
    });

    const id = result.insertedId.toString();
    const response = await axios.patch(`${API_URL}/approvals/${id}`, {
      status: 'declined',
      actedBy: 'test_user',
    });

    expect(response.status).toBe(200);

    const updated = await db.collection('approvals').findOne({ _id: result.insertedId });
    expect(updated?.status).toBe('declined');
  });
});

describe('Kill Switch Integration Tests', () => {
  let db: Db;
  let client: MongoClient;

  beforeAll(async () => {
    client = await MongoClient.connect(MONGODB_URI);
    db = client.db(DATABASE_NAME);
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  test('should activate kill switch', async () => {
    const response = await axios.post(`${API_URL}/kill-switch`, {
      enabled: true,
      reason: 'Test panic',
      setBy: 'test_user',
    });

    expect(response.status).toBe(200);
    expect(response.data.enabled).toBe(true);

    const ks = await db.collection('kill_switch').findOne({});
    expect(ks?.enabled).toBe(true);
  });

  test('should deactivate kill switch', async () => {
    await axios.post(`${API_URL}/kill-switch`, {
      enabled: true,
      reason: 'Test',
      setBy: 'test',
    });

    const response = await axios.post(`${API_URL}/kill-switch`, {
      enabled: false,
      reason: 'Resume',
      setBy: 'test_user',
    });

    expect(response.status).toBe(200);
    expect(response.data.enabled).toBe(false);
  });
});
