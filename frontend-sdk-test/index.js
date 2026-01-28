import { Barretenberg, UltraHonkBackend } from '@aztec/bb.js';
import { Noir } from '@noir-lang/noir_js';
import initNoirC from '@noir-lang/noirc_abi';
import initACVM from '@noir-lang/acvm_js';
import acvm from '@noir-lang/acvm_js/web/acvm_js_bg.wasm?url';
import noirc from '@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm?url';
import circuit from './circuit/target/circuit.json';

// Initialize WASM modules
await Promise.all([initACVM(fetch(acvm)), initNoirC(fetch(noirc))]);

const show = (id, content) => {
  const container = document.getElementById(id);
  const div = document.createElement('div');
  div.innerText = content;
  container.appendChild(div);
};

document.getElementById('submit').addEventListener('click', async () => {
  const logs = document.getElementById('logs');
  const results = document.getElementById('results');
  logs.innerHTML = '<h3>Logs</h3>'; 
  
  try {
    // --- SOLVOTE INPUTS ---
    // In a real app, these come from the wallet and UI
    const inputs = {
        balance: 100,           // User has 100 credits
        user_secret: 12345,     // Secret key
        proposal_id: 1,         // Proposal #1
        cost: 10                // Vote costs 10 credits
    };

    show('logs', `Proving Eligibility: Balance(${inputs.balance}) >= Cost(${inputs.cost})...`);

    const noir = new Noir(circuit);
    const barretenbergAPI = await Barretenberg.new();
    const backend = new UltraHonkBackend(circuit.bytecode, barretenbergAPI);

    // 1. Generate Witness
    show('logs', 'Generating Witness... ⏳');
    const { witness } = await noir.execute(inputs);
    show('logs', 'Witness Generated ✅');

    // 2. Generate Proof
    show('logs', 'Creating ZK Proof... ⏳');
    const proof = await backend.generateProof(witness);
    show('logs', 'Proof Generated ✅');

    // 3. Extract Nullifier (It's in the public inputs)
    // The output of main() is usually the last element of publicInputs
    console.log("Public Inputs:", proof.publicInputs);
    
    // Display proof hex
    const proofHex = Array.from(proof.proof).map(b => b.toString(16).padStart(2, '0')).join('');
    results.innerText = proofHex;

    // 4. Verify
    show('logs', 'Verifying... ⌛');
    const isValid = await backend.verifyProof(proof);
    show('logs', `Result: ${isValid ? 'VALID CREDENTIALS ✅' : 'INVALID ❌'}`);

  } catch (err) {
    console.error(err);
    show('logs', 'Error: ' + err.message);
  }
});