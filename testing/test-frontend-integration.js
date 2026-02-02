#!/usr/bin/env node

/**
 * Frontend Integration Test
 * Tests the frontend with the SDK and relayer
 */

const puppeteer = require('puppeteer');

const FRONTEND_URL = 'http://localhost:5173';
const RELAYER_URL = 'http://localhost:3000';

// Test results
const testResults = { passed: 0, failed: 0, errors: [] };

function log(message) {
    console.log(`[FRONTEND-TEST] ${new Date().toISOString()} - ${message}`);
}

function logSuccess(message) {
    console.log(`✅ [SUCCESS] ${message}`);
    testResults.passed++;
}

function logError(message, error = null) {
    console.error(`❌ [ERROR] ${message}`);
    if (error) console.error(`   Details: ${error.message || error}`);
    testResults.failed++;
    testResults.errors.push({ message, error: error?.message || error });
}

async function testFrontendLoad() {
    log('Testing Frontend Load...');
    
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    
    try {
        // Navigate to frontend
        await page.goto(FRONTEND_URL);
        
        // Wait for page to load
        await page.waitForSelector('body', { timeout: 10000 });
        
        // Check if page loaded successfully
        const title = await page.title();
        if (title && title.length > 0) {
            logSuccess(`Frontend loaded successfully: ${title}`);
        } else {
            logError('Frontend failed to load properly');
        }
        
        // Check for wallet connection button
        const walletButton = await page.$('button[data-testid="wallet-button"], button:contains("Connect"), .wallet-adapter-button');
        if (walletButton) {
            logSuccess('Wallet connection button found');
        } else {
            log('Wallet button not found - may need different selector');
        }
        
        // Check for SDK initialization
        const consoleLogs = [];
        page.on('console', msg => {
            consoleLogs.push(msg.text());
        });
        
        // Wait a bit for SDK to initialize
        await page.waitForTimeout(3000);
        
        // Check for SDK-related console messages
        const sdkLogs = consoleLogs.filter(log => 
            log.includes('SDK') || log.includes('solvrn') || log.includes('initialized')
        );
        
        if (sdkLogs.length > 0) {
            logSuccess(`SDK activity detected: ${sdkLogs.length} log messages`);
            sdkLogs.forEach(log => log(`   ${log}`));
        } else {
            log('No SDK activity detected in console');
        }
        
        return true;
    } catch (error) {
        logError('Frontend load test failed', error);
        return false;
    } finally {
        await browser.close();
    }
}

async function testConsoleErrors() {
    log('Testing for Console Errors...');
    
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
        const errors = [];
        const warnings = [];
        
        page.on('console', msg => {
            if (msg.type() === 'error') {
                errors.push(msg.text());
            } else if (msg.type() === 'warning') {
                warnings.push(msg.text());
            }
        });
        
        page.on('pageerror', error => {
            errors.push(error.message);
        });
        
        await page.goto(FRONTEND_URL, { waitUntil: 'networkidle2' });
        
        // Wait for any async operations
        await page.waitForTimeout(5000);
        
        if (errors.length === 0) {
            logSuccess('No console errors detected');
        } else {
            logError(`${errors.length} console errors detected`);
            errors.forEach(error => log(`   ERROR: ${error}`));
        }
        
        if (warnings.length === 0) {
            logSuccess('No console warnings detected');
        } else {
            log(`${warnings.length} console warnings detected`);
            warnings.forEach(warning => log(`   WARNING: ${warning}`));
        }
        
        return errors.length === 0;
    } catch (error) {
        logError('Console error test failed', error);
        return false;
    } finally {
        await browser.close();
    }
}

async function testNetworkRequests() {
    log('Testing Network Requests...');
    
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
        const requests = [];
        const failedRequests = [];
        
        page.on('request', request => {
            requests.push({
                url: request.url(),
                method: request.method(),
                resourceType: request.resourceType()
            });
        });
        
        page.on('requestfailed', request => {
            failedRequests.push({
                url: request.url(),
                method: request.method(),
                error: request.failure()?.errorText
            });
        });
        
        await page.goto(FRONTEND_URL, { waitUntil: 'networkidle2' });
        
        // Wait for any additional requests
        await page.waitForTimeout(3000);
        
        // Check for relayer requests
        const relayerRequests = requests.filter(req => 
            req.url.includes(RELAYER_URL) || req.url.includes('localhost:3000')
        );
        
        if (relayerRequests.length > 0) {
            logSuccess(`${relayerRequests.length} relayer requests detected`);
            relayerRequests.forEach(req => 
                log(`   ${req.method} ${req.url} (${req.resourceType})`)
            );
        } else {
            log('No relayer requests detected');
        }
        
        // Check for failed requests
        if (failedRequests.length === 0) {
            logSuccess('No failed network requests');
        } else {
            logError(`${failedRequests.length} failed network requests`);
            failedRequests.forEach(req => 
                log(`   FAILED: ${req.method} ${req.url} - ${req.error}`)
            );
        }
        
        return failedRequests.length === 0;
    } catch (error) {
        logError('Network requests test failed', error);
        return false;
    } finally {
        await browser.close();
    }
}

async function testSDKIntegration() {
    log('Testing SDK Integration...');
    
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
        // Monitor console for SDK activity
        const consoleMessages = [];
        page.on('console', msg => {
            consoleMessages.push({
                type: msg.type(),
                text: msg.text(),
                timestamp: Date.now()
            });
        });
        
        await page.goto(FRONTEND_URL, { waitUntil: 'networkidle2' });
        
        // Wait for SDK to initialize
        await page.waitForTimeout(5000);
        
        // Look for SDK-related activity
        const sdkMessages = consoleMessages.filter(msg => 
            msg.text.toLowerCase().includes('sdk') ||
            msg.text.toLowerCase().includes('solvrn') ||
            msg.text.toLowerCase().includes('initialized') ||
            msg.text.toLowerCase().includes('proposal') ||
            msg.text.toLowerCase().includes('vote')
        );
        
        if (sdkMessages.length > 0) {
            logSuccess(`SDK integration activity detected: ${sdkMessages.length} messages`);
            sdkMessages.forEach(msg => log(`   [${msg.type.toUpperCase()}] ${msg.text}`));
        } else {
            log('Limited SDK activity detected');
        }
        
        // Try to evaluate if SDK is available in window
        const sdkAvailable = await page.evaluate(() => {
            return typeof window.solvrn !== 'undefined' || 
                   typeof window.SolvrnClient !== 'undefined' ||
                   document.querySelector('script[src*="solvrn"]') !== null;
        });
        
        if (sdkAvailable) {
            logSuccess('SDK appears to be available in page context');
        } else {
            log('SDK not directly accessible in page context (may be bundled)');
        }
        
        return true;
    } catch (error) {
        logError('SDK integration test failed', error);
        return false;
    } finally {
        await browser.close();
    }
}

async function runFrontendTests() {
    log('Starting Frontend Integration Test Suite...');
    log(`Frontend URL: ${FRONTEND_URL}`);
    log(`Relayer URL: ${RELAYER_URL}`);
    
    // Check if frontend is running
    try {
        const response = await fetch(FRONTEND_URL);
        if (!response.ok) {
            log('CRITICAL: Frontend is not running, aborting tests');
            return printResults();
        }
    } catch (error) {
        log('CRITICAL: Cannot reach frontend, aborting tests');
        return printResults();
    }
    
    await testFrontendLoad();
    await testConsoleErrors();
    await testNetworkRequests();
    await testSDKIntegration();
    
    return printResults();
}

function printResults() {
    log('\n' + '='.repeat(60));
    log('FRONTEND TEST RESULTS');
    log('='.repeat(60));
    log(`✅ Passed: ${testResults.passed}`);
    log(`❌ Failed: ${testResults.failed}`);
    log(`📊 Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
    
    if (testResults.errors.length > 0) {
        log('\nERRORS:');
        testResults.errors.forEach((error, index) => {
            log(`${index + 1}. ${error.message}`);
            if (error.error) {
                log(`   ${error.error}`);
            }
        });
    }
    
    log('\n' + '='.repeat(60));
    
    return testResults.failed === 0;
}

// Run tests if this file is executed directly
if (require.main === module) {
    runFrontendTests()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Frontend test suite crashed:', error);
            process.exit(1);
        });
}

module.exports = { runFrontendTests };
