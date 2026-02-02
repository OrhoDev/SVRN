#!/usr/bin/env node

/**
 * Simple Test Website
 * A minimal website to test the SDK functionality
 */

import express from 'express';
import { SolvrnClient } from '../sdk/dist/index.js';

const app = express();
const PORT = 8080;

// Serve static files
app.use(express.static('test-site'));

// API endpoint for testing SDK
app.get('/api/test-sdk', async (req, res) => {
    const results = { passed: 0, failed: 0, tests: [] };
    
    function addTest(name, success, message) {
        results.tests.push({ name, success, message });
        if (success) results.passed++;
        else results.failed++;
    }
    
    try {
        // Test 1: SDK Creation
        try {
            const svrn = new SolvrnClient('http://localhost:3000', undefined, 'AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv');
            addTest('SDK Creation', true, 'SDK client created successfully');
        } catch (error) {
            addTest('SDK Creation', false, error.message);
        }
        
        // Test 2: SDK Initialization
        try {
            const svrn = new SolvrnClient('http://localhost:3000');
            await svrn.init();
            addTest('SDK Initialization', svrn.isReady(), `SDK ready: ${svrn.isReady()}`);
        } catch (error) {
            addTest('SDK Initialization', false, error.message);
        }
        
        // Test 3: API Access
        try {
            const svrn = new SolvrnClient('http://localhost:3000');
            const nextId = await svrn.api.getNextProposalId();
            addTest('API Access', nextId.success, `Next ID: ${nextId.nextId}`);
        } catch (error) {
            addTest('API Access', false, error.message);
        }
        
        // Test 4: Get All Proposals
        try {
            const svrn = new SolvrnClient('http://localhost:3000');
            const proposals = await svrn.api.getAllProposals();
            addTest('Get All Proposals', proposals.success, `Found ${proposals.proposals.length} proposals`);
        } catch (error) {
            addTest('Get All Proposals', false, error.message);
        }
        
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Serve the main test page
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SVRN SDK Test Site</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            text-align: center;
            margin-bottom: 30px;
        }
        .test-section {
            margin: 20px 0;
            padding: 20px;
            border: 1px solid #ddd;
            border-radius: 5px;
        }
        .test-button {
            background: #007bff;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            margin: 5px;
        }
        .test-button:hover {
            background: #0056b3;
        }
        .test-button:disabled {
            background: #ccc;
            cursor: not-allowed;
        }
        .results {
            margin-top: 20px;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 5px;
            font-family: monospace;
            white-space: pre-wrap;
        }
        .success { color: #28a745; }
        .error { color: #dc3545; }
        .info { color: #17a2b8; }
        .status {
            padding: 10px;
            margin: 10px 0;
            border-radius: 5px;
        }
        .status.success { background: #d4edda; border: 1px solid #c3e6cb; }
        .status.error { background: #f8d7da; border: 1px solid #f5c6cb; }
        .status.info { background: #d1ecf1; border: 1px solid #bee5eb; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔒 SVRN SDK Test Site</h1>
        
        <div class="test-section">
            <h2>📊 System Status</h2>
            <div id="system-status">
                <div class="status info">Checking system status...</div>
            </div>
            <button class="test-button" onclick="checkSystemStatus()">Check Status</button>
        </div>
        
        <div class="test-section">
            <h2>🧪 SDK Tests</h2>
            <button class="test-button" onclick="runSDKTests()">Run SDK Tests</button>
            <button class="test-button" onclick="runAPI Tests()">Test API Endpoints</button>
            <button class="test-button" onclick="testProposalCreation()">Test Proposal Creation</button>
            <div id="test-results"></div>
        </div>
        
        <div class="test-section">
            <h2>🔗 Live API Test</h2>
            <button class="test-button" onclick="testLiveAPI()">Test Live API</button>
            <div id="api-results"></div>
        </div>
        
        <div class="test-section">
            <h2>📝 Manual Testing</h2>
            <p>Use the console to test SDK functionality manually:</p>
            <div class="results">
// Create SDK client
const svrn = new SolvrnClient('http://localhost:3000');

// Initialize SDK
await svrn.init();

// Check if ready
svrn.isReady();

// Get next proposal ID
await svrn.api.getNextProposalId();

// Get all proposals
await svrn.api.getAllProposals();
            </div>
        </div>
    </div>

    <script type="module">
        // Import SDK for browser testing
        import { SolvrnClient } from './sdk/dist/index.js';
        
        // Make SDK available globally
        window.SolvrnClient = SolvrnClient;
        
        // System status check
        window.checkSystemStatus = async function() {
            const statusDiv = document.getElementById('system-status');
            statusDiv.innerHTML = '<div class="status info">Checking system status...</div>';
            
            const checks = [];
            
            // Check relayer
            try {
                const response = await fetch('http://localhost:3000/health');
                if (response.ok) {
                    checks.push('<div class="status success">✅ Relayer is running</div>');
                } else {
                    checks.push('<div class="status error">❌ Relayer not responding</div>');
                }
            } catch (error) {
                checks.push('<div class="status error">❌ Cannot reach relayer</div>');
            }
            
            // Check SDK availability
            if (typeof SolvrnClient !== 'undefined') {
                checks.push('<div class="status success">✅ SDK available in browser</div>');
            } else {
                checks.push('<div class="status error">❌ SDK not available</div>');
            }
            
            statusDiv.innerHTML = checks.join('');
        };
        
        // Run SDK tests
        window.runSDKTests = async function() {
            const resultsDiv = document.getElementById('test-results');
            resultsDiv.innerHTML = '<div class="status info">Running SDK tests...</div>';
            
            try {
                const response = await fetch('/api/test-sdk');
                const results = await response.json();
                
                let html = '<h3>Test Results</h3>';
                html += '<div class="status info">✅ Passed: ' + results.passed + ' | ❌ Failed: ' + results.failed + '</div>';
                
                results.tests.forEach(test => {
                    const statusClass = test.success ? 'success' : 'error';
                    const icon = test.success ? '✅' : '❌';
                    html += '<div class="status ' + statusClass + '">' + icon + ' ' + test.name + ': ' + test.message + '</div>';
                });
                
                resultsDiv.innerHTML = html;
            } catch (error) {
                resultsDiv.innerHTML = '<div class="status error">❌ Test failed: ' + error.message + '</div>';
            }
        };
        
        // Test API endpoints
        window.runAPITests = async function() {
            const resultsDiv = document.getElementById('test-results');
            resultsDiv.innerHTML = '<div class="status info">Testing API endpoints...</div>';
            
            const tests = [];
            
            // Test health endpoint
            try {
                const response = await fetch('http://localhost:3000/health');
                const data = await response.json();
                tests.push({ name: 'Health Check', success: response.ok, message: 'Status: ' + data.status });
            } catch (error) {
                tests.push({ name: 'Health Check', success: false, message: error.message });
            }
            
            // Test next proposal ID
            try {
                const response = await fetch('http://localhost:3000/next-proposal-id');
                const data = await response.json();
                tests.push({ name: 'Next Proposal ID', success: data.success, message: 'ID: ' + data.nextId });
            } catch (error) {
                tests.push({ name: 'Next Proposal ID', success: false, message: error.message });
            }
            
            // Test get all proposals
            try {
                const response = await fetch('http://localhost:3000/proposals');
                const data = await response.json();
                tests.push({ name: 'Get All Proposals', success: data.success, message: 'Found: ' + data.proposals.length + ' proposals' });
            } catch (error) {
                tests.push({ name: 'Get All Proposals', success: false, message: error.message });
            }
            
            let html = '<h3>API Test Results</h3>';
            tests.forEach(test => {
                const statusClass = test.success ? 'success' : 'error';
                const icon = test.success ? '✅' : '❌';
                html += '<div class="status ' + statusClass + '">' + icon + ' ' + test.name + ': ' + test.message + '</div>';
            });
            
            resultsDiv.innerHTML = html;
        };
        
        // Test proposal creation
        window.testProposalCreation = async function() {
            const resultsDiv = document.getElementById('test-results');
            resultsDiv.innerHTML = '<div class="status info">Testing proposal creation...</div>';
            
            try {
                const proposalData = {
                    proposalId: Date.now(),
                    votingMint: 'So11111111111111111111111111111111111111112',
                    metadata: {
                        title: 'Test Proposal from Web',
                        desc: 'This is a test proposal created via the web interface',
                        duration: 24
                    },
                    creator: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'
                };
                
                const response = await fetch('http://localhost:3000/create-proposal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(proposalData)
                });
                
                const data = await response.json();
                
                if (data.success) {
                    resultsDiv.innerHTML = '<div class="status success">✅ Proposal created successfully!</div>' +
                        '<div class="status info">Proposal ID: ' + proposalData.proposalId + '</div>' +
                        '<div class="status info">Transaction: ' + data.tx + '</div>';
                } else {
                    resultsDiv.innerHTML = '<div class="status error">❌ Proposal creation failed: ' + (data.error || 'Unknown error') + '</div>';
                }
            } catch (error) {
                resultsDiv.innerHTML = '<div class="status error">❌ Proposal creation error: ' + error.message + '</div>';
            }
        };
        
        // Test live API
        window.testLiveAPI = async function() {
            const apiResults = document.getElementById('api-results');
            apiResults.innerHTML = '<div class="status info">Testing live API...</div>';
            
            try {
                // Test multiple endpoints
                const endpoints = [
                    '/health',
                    '/next-proposal-id',
                    '/proposals',
                    '/proposals/active'
                ];
                
                const results = [];
                
                for (const endpoint of endpoints) {
                    try {
                        const response = await fetch('http://localhost:3000' + endpoint);
                        const data = await response.json();
                        results.push({
                            endpoint,
                            status: response.status,
                            success: response.ok,
                            data: JSON.stringify(data).substring(0, 100) + '...'
                        });
                    } catch (error) {
                        results.push({
                            endpoint,
                            status: 'ERROR',
                            success: false,
                            data: error.message
                        });
                    }
                }
                
                let html = '<h3>Live API Results</h3>';
                results.forEach(result => {
                    const statusClass = result.success ? 'success' : 'error';
                    const icon = result.success ? '✅' : '❌';
                    html += '<div class="status ' + statusClass + '">' + icon + ' ' + result.endpoint + ' (' + result.status + ')</div>';
                    html += '<div class="results">' + result.data + '</div>';
                });
                
                apiResults.innerHTML = html;
            } catch (error) {
                apiResults.innerHTML = '<div class="status error">❌ Live API test failed: ' + error.message + '</div>';
            }
        };
        
        // Auto-check system status on load
        setTimeout(checkSystemStatus, 1000);
    </script>
</body>
</html>
    `);
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Test website running at http://localhost:${PORT}`);
    console.log(`📊 Open http://localhost:${PORT} to test the SDK`);
});
