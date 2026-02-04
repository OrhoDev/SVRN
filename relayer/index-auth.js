"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Simple authentication wrapper for the existing relayer
const express_2 = __importDefault(require("express"));
const auth_config_js_2 = require("./auth-config.js");
// Import the original relayer
require("./index.js");
// Add authentication middleware to existing endpoints
const app = (0, express_2.default)();
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
app.use((req, res, next) => {
    const path = req.path;
    // Check if this is a protected endpoint
    const isProtected = protectedEndpoints.some(endpoint => path.startsWith(endpoint));
    if (isProtected) {
        // Apply authentication
        return (0, auth_config_js_2.apiKeyAuth)(req, res, next);
    }
    next();
});
// Apply rate limiting to protected endpoints
app.use((req, res, next) => {
    const path = req.path;
    const isProtected = protectedEndpoints.some(endpoint => path.startsWith(endpoint));
    if (isProtected) {
        return (0, auth_config_js_2.apiKeyRateLimit)(req, res, next);
    }
    next();
});
console.log('Authentication middleware loaded');
