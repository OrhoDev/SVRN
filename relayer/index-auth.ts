// Simple authentication wrapper for the existing relayer
import express, { Request, Response } from 'express';
import { apiKeyAuth, apiKeyRateLimit } from './auth-config.js';

// Import the original relayer
import './index.js';

// Add authentication middleware to existing endpoints
const app = express();

// Apply authentication to protected endpoints
const protectedEndpoints = [
    '/initialize-snapshot',
    '/create-proposal', 
    '/add-creator',
    '/get-proof',
    '/relay-vote',
    '/prove-tally',
    '/vote-counts'
];

// Middleware to add authentication
app.use((req: Request, res: Response, next: any) => {
    const path = req.path;
    
    // Check if this is a protected endpoint
    const isProtected = protectedEndpoints.some(endpoint => 
        path.startsWith(endpoint)
    );
    
    if (isProtected) {
        // Apply authentication
        return apiKeyAuth(req, res, next);
    }
    
    next();
});

// Apply rate limiting to protected endpoints
app.use((req: Request, res: Response, next: any) => {
    const path = req.path;
    
    const isProtected = protectedEndpoints.some(endpoint => 
        path.startsWith(endpoint)
    );
    
    if (isProtected) {
        return apiKeyRateLimit(req, res, next);
    }
    
    next();
});

console.log('Authentication middleware loaded');
