// Test SDK default URL
import { SolvrnClient } from './dist/index.js';

console.log('=== Testing SDK Default URL ===');

// Test 1: Create client without URL (should use default)
const client1 = new SolvrnClient();
console.log('Client 1 URL:', client1.api.baseUrl);

// Test 2: Create client with explicit URL (should override)
const client2 = new SolvrnClient('http://custom-url.com');
console.log('Client 2 URL:', client2.api.baseUrl);

// Test 3: Verify default URL matches our tunnel
const expectedUrl = 'https://injured-catering-reactions-protocol.trycloudflare.com';
console.log('Expected URL:', expectedUrl);
console.log('Client 1 matches expected:', client1.api.baseUrl === expectedUrl);

console.log('=== Test Complete ===');
